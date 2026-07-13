/**
 * Hashtag Intelligence Service
 *
 * Generates tiered hashtag sets optimized for discovery, targeting, and niche
 * reach. Uses LLM to produce rotating hashtag strategies so no two consecutive
 * posts share the same hashtag list.
 */
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import { applyAdaptivePlan } from '../lib/adaptivePlanning';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';

export const HASHTAG_TIERS = {
  tier1: { label: 'Discovery', targetPostCount: '1M-10M', maxPerPost: 5 },
  tier2: { label: 'Targeted', targetPostCount: '100K-1M', maxPerPost: 10 },
  tier3: { label: 'Niche', targetPostCount: '10K-100K', maxPerPost: 15 },
} as const;

export interface HashtagSet {
  tier1: string[];
  tier2: string[];
  tier3: string[];
  allHashtags: string[];
  reasoning?: string;
  explanation?: import('../lib/explainer').Explanation;
}

interface GenerateHashtagParams {
  topic: string;
  industry: string;
  brandKeywords: string[];
  platform: 'instagram' | 'tiktok';
  postNumber: number;
  brandProfileId?: string;
}

/**
 * Counts how many posts (published or pending) exist for a given brand.
 * Used as the postNumber for rotation.
 */
export async function getPostHashtagCount(brandProfileId: string): Promise<number> {
  const rows = await db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.brandProfileId, brandProfileId))
    .all();

  return rows.length;
}

/**
 * Generates a rotating hashtag set for a post using the LLM.
 * The rotation seed (postNumber % 5) ensures different sets for consecutive posts.
 *
 * If a brandProfileId is provided, the adaptive plan is consulted and the
 * `hashtagCountTarget` from any active rules is applied to all three tiers.
 */
export async function generateHashtagSet(params: GenerateHashtagParams): Promise<HashtagSet> {
  const { topic, industry, brandKeywords, platform, postNumber, brandProfileId } = params;
  const rotationSet = postNumber % 5;

  // Compute per-tier max counts. If the brand's adaptive plan says reduce
  // hashtags, scale all three tiers proportionally.
  let tier1Max: number = HASHTAG_TIERS.tier1.maxPerPost;
  let tier2Max: number = HASHTAG_TIERS.tier2.maxPerPost;
  let tier3Max: number = HASHTAG_TIERS.tier3.maxPerPost;
  let adaptiveReductionApplied = false;

  if (brandProfileId) {
    try {
      const adjustments = await applyAdaptivePlan(brandProfileId, { platform, topic });
      const target = Number(adjustments.hashtagCountTarget);
      const baselineTotal = tier1Max + tier2Max + tier3Max;
      if (!Number.isNaN(target) && target > 0 && target < baselineTotal) {
        const scale = target / baselineTotal;
        tier1Max = Math.max(1, Math.round(tier1Max * scale));
        tier2Max = Math.max(1, Math.round(tier2Max * scale));
        tier3Max = Math.max(1, Math.round(tier3Max * scale));
        adaptiveReductionApplied = true;
      }
    } catch (err) {
      console.warn('[HashtagService] applyAdaptivePlan failed:', (err as Error).message);
    }
  }

  const prompt = `You are a professional Instagram growth strategist. Generate a rotating hashtag strategy for a post. This is rotation set ${rotationSet} of 5 — generate a DIFFERENT set than the other rotations.

Topic: ${topic}
Industry: ${industry}
Brand keywords: ${brandKeywords.join(', ')}
Platform: ${platform}
${
  adaptiveReductionApplied
    ? `The brand's adaptive plan calls for fewer hashtags. Generate exactly ${tier1Max} tier1, ${tier2Max} tier2, and ${tier3Max} tier3 hashtags.`
    : ''
}

Return ONLY valid JSON with exactly these fields:
{
  "tier1": [exactly ${tier1Max} hashtags with 1M-10M posts — broad discovery, no spaces in hashtag],
  "tier2": [exactly ${tier2Max} hashtags with 100K-1M posts — targeted community],
  "tier3": [exactly ${tier3Max} hashtags with under 100K posts — niche where you can rank on page 1],
  "reasoning": "One sentence explaining why these hashtags suit this content"
}

Rules:
- Never include the brand name as a hashtag unless it has over 10K posts
- Never generate the same hashtag in two different tiers
- Tier 3 hashtags should be highly specific (e.g. #veganmealpreplondon not #vegan)
- All hashtags must be single words or concatenated words, no spaces`;

  const text = await callWithProviderChain(
    'hashtag generation',
    async (provider, modelId) => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      return t;
    },
    () => {
      // Fallback hashtag set based on topic and industry
      const fallbackTags = [
        topic.replace(/\s+/g, '').toLowerCase(),
        industry.replace(/\s+/g, '').toLowerCase(),
        'vimo',
        'marketing',
        'growth',
        'socialmedia',
        'content',
        'branding',
        'digitalmarketing',
        'tips',
        'business',
        ...brandKeywords.slice(0, 3).map(k => k.replace(/\s+/g, '').toLowerCase()),
      ].filter(Boolean);
      return JSON.stringify({
        tier1: fallbackTags.slice(0, tier1Max),
        tier2: [...fallbackTags.slice(tier1Max, tier1Max + tier2Max), 'trending', 'viral', 'mustread', 'learn', 'howto'].slice(0, tier2Max),
        tier3: [...fallbackTags.slice(tier1Max + tier2Max, tier1Max + tier2Max + tier3Max), 'niche', 'community', 'experttips', 'grow', 'strategy'].slice(0, tier3Max),
      });
    }
  );

  const cleanedText = text.replace(/^```json/i, '').replace(/```$/i, '').trim();

  let parsed: { tier1: string[]; tier2: string[]; tier3: string[]; reasoning?: string };

  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    // If JSON parse fails, extract the hashtags using regex
    const allHashtags = cleanedText.match(/#[\w]+/g) || [];
    const tags = allHashtags.map((h) => h.replace(/^#/, ''));
    // Distribute as best we can
    parsed = {
      tier1: tags.slice(0, tier1Max),
      tier2: tags.slice(tier1Max, tier1Max + tier2Max),
      tier3: tags.slice(tier1Max + tier2Max, tier1Max + tier2Max + tier3Max),
    };
  }

  const tier1 = (parsed.tier1 || []).slice(0, tier1Max).map((t) => t.replace(/^#/, ''));
  const tier2 = (parsed.tier2 || []).slice(0, tier2Max).map((t) => t.replace(/^#/, ''));
  const tier3 = (parsed.tier3 || []).slice(0, tier3Max).map((t) => t.replace(/^#/, ''));

  // Generate explanation for hashtag tier strategy
  let hashtagExplanation: import('../lib/explainer').Explanation | undefined;
  try {
    const { explainHashtagTier } = await import('../lib/explainer');
    hashtagExplanation = await explainHashtagTier({
      brandProfileId: '',
      tier1,
      tier2,
      tier3,
      topic: params.topic,
    });
  } catch { /* ignore */ }

  return {
    tier1,
    tier2,
    tier3,
    allHashtags: [...tier1, ...tier2, ...tier3],
    reasoning: parsed.reasoning,
    explanation: hashtagExplanation,
  };
}
