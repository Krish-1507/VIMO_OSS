import { generateText } from 'ai';
import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import { getBrandContext } from './brandMemoryService';
import { applyAdaptivePlan } from '../lib/adaptivePlanning';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { TaskType, getModelForTask, recordLLMUsage, estimateTokenCount, calculateCost } from '../lib/modelRouter';
import { sanitizeUserInput } from '../lib/promptSanitizer';
import { generateHashtagSet, getPostHashtagCount, HASHTAG_TIERS } from './hashtagService';
import { selectContentType, getRandomHook, CONTENT_TYPES } from '../lib/contentVarietySystem';
import { db } from '../db';
import { brandProfiles, scheduledPosts } from '../db/schema';
import { crawlWebsite, buildWebsitePrompt, type WebsiteAnalysis } from './websiteCrawler';

// In-memory cache for website analysis to avoid re-crawling on every generation
const websiteCache = new Map<string, { analysis: WebsiteAnalysis; prompt: string; fetchedAt: number }>();
const WEBSITE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getWebsiteContext(brandProfileId: string): Promise<string> {
  try {
    const brand = await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
    if (!brand?.website) return '';

    const cached = websiteCache.get(brandProfileId);
    if (cached && Date.now() - cached.fetchedAt < WEBSITE_CACHE_TTL) {
      return cached.prompt;
    }

    const analysis = await Promise.race([
      crawlWebsite(brand.website!),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);

    if (analysis) {
      const prompt = buildWebsitePrompt(analysis, brand.name, brand.industry);
      websiteCache.set(brandProfileId, { analysis, prompt, fetchedAt: Date.now() });
      return prompt;
    }
  } catch { /* non-critical */ }
  return '';
}

export interface PlatformConstraints {
  maxLength: number;
  hashtagLimit: number;
  supportsMarkdown: boolean;
  formatNote: string;
}

export const PLATFORM_CONSTRAINTS: Record<string, PlatformConstraints> = {
  instagram: {
    maxLength: 2200,
    hashtagLimit: 30,
    supportsMarkdown: false,
    formatNote: 'Conversational, emoji-friendly, ends with a question or CTA, 3-10 hashtags',
  },
  linkedin: {
    maxLength: 3000,
    hashtagLimit: 5,
    supportsMarkdown: false,
    formatNote: 'Professional, structured with line breaks, starts with a hook, 3-5 hashtags',
  },
  twitter: {
    maxLength: 280,
    hashtagLimit: 2,
    supportsMarkdown: false,
    formatNote: 'Punchy, one clear idea, optional hashtags, no em dashes',
  },
  tiktok: {
    maxLength: 2200,
    hashtagLimit: 15,
    supportsMarkdown: false,
    formatNote: 'Casual, hook in first line, trending hashtags, emoji heavy',
  },
  youtube: {
    maxLength: 5000,
    hashtagLimit: 15,
    supportsMarkdown: false,
    formatNote: 'SEO-optimized description, keywords in first 200 chars, timestamps if relevant',
  },
  facebook: {
    maxLength: 63206,
    hashtagLimit: 0,
    supportsMarkdown: false,
    formatNote: 'Conversational, storytelling style, ask questions, minimal hashtags',
  },
  pinterest: {
    maxLength: 500,
    hashtagLimit: 0,
    supportsMarkdown: false,
    formatNote: 'Descriptive, keyword-rich, actionable, describe the image content',
  },
  reddit: {
    maxLength: 40000,
    hashtagLimit: 0,
    supportsMarkdown: true,
    formatNote: 'Community-first, no self-promotion tone, adds value, uses Reddit markdown',
  },
  bluesky: {
    maxLength: 300,
    hashtagLimit: 3,
    supportsMarkdown: false,
    formatNote: 'Thoughtful, no engagement bait, links welcome',
  },
  threads: {
    maxLength: 500,
    hashtagLimit: 5,
    supportsMarkdown: false,
    formatNote: 'Casual Twitter-like, conversational, short and punchy',
  },
};

export interface GeneratePostResult {
  content: string;
  hashtags: string[];
  imageSuggestion: string;
  hashtagTiers?: { tier1: string[]; tier2: string[]; tier3: string[] };
  contentType?: string;
  originalContentType?: string;
  adaptiveApplied?: boolean;
  adaptiveRuleIds?: string[];
  graphApplied?: boolean;
  graphConfidence?: number;
  graphReasoning?: string;
  graphRecommendedTopic?: string;
  explanation?: import('../lib/explainer').Explanation;
}

export interface GenerateVariantsResult {
  content: string;
  hashtags: string[];
  tone: string;
}

export async function generatePost(params: {
  brandProfileId: string;
  platform: string;
  topic: string;
  additionalContext?: string;
  tone?: string;
}): Promise<GeneratePostResult> {
  const { brandProfileId, platform, topic, additionalContext, tone } = params;

  const sanitizedTopic = sanitizeUserInput(topic);
  const sanitizedContext = additionalContext ? sanitizeUserInput(additionalContext) : undefined;
  const sanitizedTone = tone ? sanitizeUserInput(tone) : undefined;

  const brandContext = await getBrandContext(brandProfileId, sanitizedTopic);
  const constraints = PLATFORM_CONSTRAINTS[platform];
  if (!constraints) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Get brand profile for industry and keywords.
  // Tests (and some runtime paths) may call generatePost with a brandProfileId
  // that doesn't exist yet; in that case fall back to safe defaults.
  let industry = 'General';
  let brandKeywords: string[] = [];
  try {
    const brandRow = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, brandProfileId))
      .get();
    industry = brandRow?.industry || 'General';
    brandKeywords = brandRow?.toneKeywordsJson ? (JSON.parse(brandRow.toneKeywordsJson) as string[]) : [];
  } catch {
    // ignore and use defaults
  }

  // Get recent post types for content variety selection
  const recentPosts = await db
    .select({ metadataJson: scheduledPosts.metadataJson })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.brandProfileId, brandProfileId))
    .all();

  const recentPostTypes = recentPosts
    .map((p) => {
      try {
        const m = p.metadataJson ? JSON.parse(p.metadataJson) : {};
        return m.contentType as string | undefined;
      } catch { return undefined; }
    })
    .filter(Boolean);

  // Select content type and hook
  const selectedTypeKey = selectContentType(recentPostTypes.map((t) => ({ contentType: t })));
  let workingContentType = selectedTypeKey;
  const hookTemplate = getRandomHook(selectedTypeKey);

  // Apply adaptive plan — may change content type or add guidance
  let adaptiveApplied = false;
  const appliedRuleIds: string[] = [];
  let adaptiveGuidance: string[] = [];
  let contentTypeWeightsForSelection: Record<string, number> = {};
  let avoidedTypes: string[] = [];
  try {
    const adjustments = await applyAdaptivePlan(brandProfileId, {
      platform,
      topic: sanitizedTopic,
      contentType: workingContentType,
    });

    if (adjustments.appliedRuleIds.length > 0) {
      adaptiveApplied = true;
      appliedRuleIds.push(...adjustments.appliedRuleIds);
    }

    contentTypeWeightsForSelection = adjustments.contentTypeWeights || {};
    avoidedTypes = adjustments.avoidedContentTypes || [];

    // If the currently selected type is in avoidedContentTypes, pick a different one
    if (avoidedTypes.includes(workingContentType)) {
      const fallbackKey = selectContentType(
        recentPostTypes.map((t) => ({ contentType: t })),
        {
          weights: contentTypeWeightsForSelection,
          avoidContentTypes: avoidedTypes,
        }
      );
      workingContentType = fallbackKey;
    } else if (Object.keys(contentTypeWeightsForSelection).length > 0) {
      // Re-roll with weighted selection so a 2x weight type appears twice as often
      const rerolled = selectContentType(
        recentPostTypes.map((t) => ({ contentType: t })),
        {
          weights: contentTypeWeightsForSelection,
          avoidContentTypes: avoidedTypes,
        }
      );
      // Only swap if the reroll actually picked a different type — otherwise keep the
      // already-balanced one we had.
      if (rerolled !== workingContentType) {
        workingContentType = rerolled;
      }
    }

    adaptiveGuidance = adjustments.notes || [];
  } catch (err) {
    console.warn('[ContentGen] applyAdaptivePlan failed:', (err as Error).message);
  }

  const finalSelectedType = CONTENT_TYPES[workingContentType];
  const contentTypeChanged = workingContentType !== selectedTypeKey;

  // Apply knowledge-graph recommendation on top of the adaptive plan.
  // The graph is built from real performance relationships between content
  // types, platforms, time windows and audience segments. If we have enough
  // signal (graphConfidence > 0.6), prefer what the graph says.
  let graphApplied = false;
  let graphReasoning: string | null = null;
  let graphConfidence = 0;
  let graphRecommendedType: string | null = null;
  let graphRecommendedTopic: string | null = null;
  try {
    const { getContentRecommendationFromGraph } = await import('./knowledgeGraphService');
    const rec = await getContentRecommendationFromGraph({
      brandProfileId,
      platform,
      currentHour: new Date().getHours(),
    });
    if (rec && rec.graphConfidence > 0.6) {
      graphConfidence = rec.graphConfidence;
      graphReasoning = rec.reasoning;
      graphRecommendedType = rec.recommendedContentType;
      graphRecommendedTopic = rec.recommendedTopic;
      // Only swap if we know the type and it's not in avoidedTypes
      if (
        rec.recommendedContentType &&
        CONTENT_TYPES[rec.recommendedContentType] &&
        !avoidedTypes.includes(rec.recommendedContentType)
      ) {
        if (workingContentType !== rec.recommendedContentType) {
          graphApplied = true;
          workingContentType = rec.recommendedContentType;
        }
      }
    }
  } catch (err) {
    console.warn('[ContentGen] getContentRecommendationFromGraph failed:', (err as Error).message);
  }

  // Generate hashtags using dedicated service (only for instagram/tiktok)
  let hashtagSet = { tier1: [] as string[], tier2: [] as string[], tier3: [] as string[], allHashtags: [] as string[] };
  if (platform === 'instagram' || platform === 'tiktok') {
    try {
      const postCount = await getPostHashtagCount(brandProfileId);
      hashtagSet = await generateHashtagSet({
        topic: sanitizedTopic,
        industry,
        brandKeywords,
        platform: platform as 'instagram' | 'tiktok',
        postNumber: postCount,
        brandProfileId,
      });
    } catch (err) {
      console.warn('[ContentGen] Hashtag generation failed, using simple fallback:', (err as Error).message);
    }
  }

  const emojiDensityMap: Record<string, string> = {
    none: 'none (0 emojis)',
    low: 'low (1-2 emojis)',
    medium: 'medium (3-5 emojis)',
    heavy: 'heavy (6+ emojis)',
  };

  const captionLengthMap: Record<string, string> = {
    short: 'short (50-100 words)',
    medium: 'medium (100-200 words)',
    long: 'long (200-300 words)',
  };

  // Get website context for brand-specific content depth
  const websiteContext = await getWebsiteContext(brandProfileId);

  const prompt = `${brandContext}
${websiteContext ? `\nWEBSITE ANALYSIS (reference these details to make the post authentic):\n${websiteContext}\n` : ''}

TASK: Write a ${platform} post about: ${sanitizedTopic}
${sanitizedContext ? 'Additional context: ' + sanitizedContext : ''}
${sanitizedTone ? 'Tone: ' + sanitizedTone : ''}

PLATFORM REQUIREMENTS:
${constraints.formatNote}
Maximum length: ${constraints.maxLength} characters
Maximum hashtags: ${constraints.hashtagLimit}

CONTENT TYPE: ${finalSelectedType.label}
STRUCTURE TO FOLLOW: ${finalSelectedType.structure}
CAPTION LENGTH: ${captionLengthMap[finalSelectedType.captionLength]}
EMOJI DENSITY: ${emojiDensityMap[finalSelectedType.emojiDensity]}
HOOK STYLE: Start the caption using this hook as inspiration (do not copy it verbatim, fill in the specifics for this brand and topic): ${hookTemplate}
CRITICAL: The caption must start with the hook on the first line. No preamble.

${
  adaptiveGuidance.length > 0
    ? `ADAPTIVE GUIDANCE (based on this brand's performance history):\n- ${adaptiveGuidance.join(
        '\n- '
      )}\nApply these preferences to the generated content.`
    : ''
}

Return ONLY a JSON object with:
  content (string — the post text only, no hashtags inline unless platform convention requires it),
  imageSuggestion (string — a detailed visual description for an AI image generation prompt that would accompany this post perfectly)`;

  const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);

  const text = await callWithProviderChain(
    'content generation',
    async (provider, modelId) => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      // Record usage after successful LLM call
      const inputTokens = estimateTokenCount(prompt);
      const outputTokens = estimateTokenCount(t);
      const cost = calculateCost(modelRoute.modelId, inputTokens, outputTokens);
      recordLLMUsage({
        taskType: TaskType.CONTENT_GENERATION,
        provider: modelRoute.provider,
        modelId: modelRoute.modelId,
        inputTokens,
        outputTokens,
        costUSD: cost,
        brandProfileId,
        relatedEntityType: 'content_generation',
      });
      return t;
    },
    () => {
      // Template-based fallback with website data if available
      const products = websiteContext.includes('Products:') ? websiteContext.split('Products:')[1]?.split('\n')[0]?.trim() : '';
      const services = websiteContext.includes('Services:') ? websiteContext.split('Services:')[1]?.split('\n')[0]?.trim() : '';
      const industryRef = products || services || industry;
      const hashtag = '#' + (industryRef.split(',').shift()?.trim()?.replace(/\s+/g, '') || topic.replace(/\s+/g, ''));
      return JSON.stringify({
        content: `💡 ${topic}\n\nAt ${industryRef}, we're passionate about helping ${brandKeywords.slice(0, 2).join(' & ') || 'businesses'} succeed. This is one of the most important conversations in our industry right now.\n\nWhat do you think? Drop your thoughts below 👇\n\n${hashtag} #VIMO`,
        imageSuggestion: `Professional ${industry} image related to ${topic}, featuring ${industryRef}`,
      });
    },
    modelRoute
  );

  const parsed = JSON.parse(text.trim());

  // Generate explanation for content type choice
  let contentTypeExplanation: import('../lib/explainer').Explanation | undefined;
  try {
    const { explainContentTypeChoice } = await import('../lib/explainer');
    contentTypeExplanation = await explainContentTypeChoice({
      brandProfileId,
      selectedContentType: workingContentType,
      topic: sanitizedTopic,
    });

    // Augment the explanation with the knowledge-graph reasoning chain
    if (graphReasoning && graphConfidence > 0.6) {
      const dataPoint = `Based on your performance relationships: ${graphReasoning} (graph confidence ${(graphConfidence * 100).toFixed(0)}%).`;
      contentTypeExplanation = {
        ...contentTypeExplanation,
        summary: contentTypeExplanation.summary
          ? `${contentTypeExplanation.summary} ${dataPoint}`
          : dataPoint,
        dataPoints: [...(contentTypeExplanation.dataPoints || []), dataPoint],
        // If the graph has stronger evidence, raise the confidence
        confidence: Math.max(contentTypeExplanation.confidence, Math.round(graphConfidence * 100)),
      };
    }
  } catch { /* ignore */ }

  const result: GeneratePostResult = {
    content: parsed.content,
    hashtags: hashtagSet.allHashtags.length > 0 ? hashtagSet.allHashtags : (parsed.hashtags || []),
    imageSuggestion: parsed.imageSuggestion || '',
    hashtagTiers: hashtagSet.tier1.length > 0 ? hashtagSet : undefined,
    contentType: workingContentType,
    originalContentType: (contentTypeChanged || graphApplied) ? selectedTypeKey : undefined,
    adaptiveApplied: adaptiveApplied || contentTypeChanged || undefined,
    adaptiveRuleIds: appliedRuleIds.length > 0 ? appliedRuleIds : undefined,
    graphApplied: graphApplied || undefined,
    graphConfidence: graphConfidence > 0 ? graphConfidence : undefined,
    graphReasoning: graphReasoning || undefined,
    graphRecommendedTopic: graphRecommendedTopic || undefined,
    explanation: contentTypeExplanation,
  };

  if (result.content.length > constraints.maxLength) {
    throw new Error(`Generated content exceeds maximum length of ${constraints.maxLength} characters`);
  }

  if (result.hashtags.length > constraints.hashtagLimit) {
    result.hashtags = result.hashtags.slice(0, constraints.hashtagLimit);
  }

  return result;
}

export async function generateVariants(params: {
  brandProfileId: string;
  platform: string;
  topic: string;
  count: number;
}): Promise<GenerateVariantsResult[]> {
  const { brandProfileId, platform, topic, count } = params;

  const tones = ['primary brand voice', 'more conversational', 'more authoritative'];
  const results: GenerateVariantsResult[] = [];

  for (let i = 0; i < Math.min(count, tones.length); i++) {
    const result = await generatePost({
      brandProfileId,
      platform,
      topic,
      tone: tones[i],
    });
    results.push({
      content: result.content,
      hashtags: result.hashtags,
      tone: tones[i],
    });
  }

  return results;
}

export async function repurposeContent(params: {
  brandProfileId: string;
  sourceContent: string;
  sourcePlatform: string;
  targetPlatforms: string[];
}): Promise<Record<string, { content: string; hashtags: string[] }>> {
  const { brandProfileId, sourceContent, sourcePlatform, targetPlatforms } = params;
  const results: Record<string, { content: string; hashtags: string[] }> = {};

  for (const platform of targetPlatforms) {
    const result = await generatePost({
      brandProfileId,
      platform,
      topic: `Repurpose this content: ${sourceContent}`,
      additionalContext: `Original platform: ${sourcePlatform}. Adapt for ${platform}.`,
    });

    results[platform] = {
      content: result.content,
      hashtags: result.hashtags,
    };
  }

  return results;
}

export async function generateABVariants(params: {
  brandProfileId: string;
  platform: string;
  topic: string;
}): Promise<{ variantA: string; variantB: string; differentiator: string }> {
  const { brandProfileId, platform, topic } = params;

  const variantA = await generatePost({
    brandProfileId,
    platform,
    topic,
    additionalContext: 'Lead with a question. Make the opening hook a question.',
  });

  const variantB = await generatePost({
    brandProfileId,
    platform,
    topic,
    additionalContext: 'Lead with a strong statement. Make the opening hook a declarative statement.',
  });

  return {
    variantA: variantA.content,
    variantB: variantB.content,
    differentiator:
      'Variant A leads with a question to spark curiosity and engagement, while Variant B opens with a bold statement to establish authority and provoke thought.',
  };
}

export async function generateTextContent(params: {
  brandProfileId: string;
  platform: string;
  topic: string;
  format: 'video_script' | 'caption' | 'description';
}): Promise<string> {
  const { brandProfileId, platform, topic, format } = params;

  const sanitizedTopic = sanitizeUserInput(topic);
  const brandContext = await getBrandContext(brandProfileId, sanitizedTopic);

  const formatInstructions: Record<string, string> = {
    video_script: `Write a short-form video script for ${platform}. 
Structure as:
- HOOK (first 3 seconds, attention-grabbing)
- BODY (the main content)
- CTA (call to action)

Use a casual, engaging tone. Keep it under 60 seconds when read aloud.`,
    caption: `Write an engaging ${platform} caption about the topic. 
Include a hook, body, and call to action. Keep it concise and platform-appropriate.`,
    description: `Write a detailed description for ${platform} about the topic. 
Include relevant context, benefits, and a clear value proposition.`,
  };

  const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);

  const text = await callWithProviderChain(
    'text content generation',
    async (provider, modelId) => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt: `${brandContext}

TASK: Write a ${format} for this brand about: ${sanitizedTopic}
PLATFORM: ${platform}

FORMAT INSTRUCTIONS:
${formatInstructions[format] || formatInstructions.caption}

Return ONLY the raw content. No JSON, no explanation, no prefix.`,
      });
      return t;
    },
    () => {
      // Template fallback
      const hashtag = '#' + sanitizedTopic.replace(/\s+/g, '');
      return `🎬 ${sanitizedTopic}

Here's what you need to know about this topic...

${hashtag}`;
    },
    modelRoute
  );

  return text.trim();
}
