/**
 * Brand Memory Service — Living Brand Brain
 *
 * Records everything the brand does, learns from every interaction, and makes
 * every future output smarter. Stores performance lessons, audience insights,
 * campaign memory, and content DNA on the brand profile.
 */

import crypto from 'crypto';
import { generateText } from 'ai';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles, scheduledPosts, campaigns } from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';
import { sanitizeUserInput } from '../lib/promptSanitizer';
import { getRelevantExamples } from './brandBrainService';

/* ------------------------------------------------------------------ */
/*  TypeScript Interfaces                                              */
/* ------------------------------------------------------------------ */

export interface PerformanceLesson {
  id: string;
  learnedAt: string;
  lesson: string;
  contentType: string;
  platform: string;
  engagementRate: number;
  whatWorked: string;
  whatToAvoidInFuture: string;
}

export interface AudienceInsight {
  id: string;
  discoveredAt: string;
  segment: string;
  contentTheyEngageWith: string;
  bestTimeToReach: string;
  estimatedSize: string;
}

export interface CampaignMemory {
  campaignId: string;
  completedAt: string;
  goalType: string;
  totalPosts: number;
  avgEngagementRate: number;
  topPerformingContentType: string;
  lessonsLearned: string;
  followerGrowth: number;
}

export interface ContentDNA {
  strongestHooks: string[];
  avoidTheseFormats: string[];
  bestPerformingTopics: string[];
  brandVoiceEvolution: string;
  lastUpdated: string;
}

/* ------------------------------------------------------------------ */
/*  Helper — loads a brand profile row with all memory fields          */
/* ------------------------------------------------------------------ */

function parseJsonField<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

async function loadBrandRow(brandProfileId: string) {
  const row = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  // Don’t hard-fail in unit tests / early boot paths where a brand profile
  // may not exist yet.
  if (!row) {
    return {
      id: brandProfileId,
      name: 'Unknown Brand',
      audience: 'General',
      industry: 'General',
      toneKeywordsJson: '[]',
      performanceLessons: '[]',
      audienceInsights: '[]',
      campaignMemory: '[]',
      contentDNA: JSON.stringify({
        strongestHooks: [],
        avoidTheseFormats: [],
        bestPerformingTopics: [],
        brandVoiceEvolution: '',
        lastUpdated: '',
      }),
      voiceFingerprint: null,
      totalPostsGenerated: 0,
      totalCampaignsRun: 0,
      updatedAt: new Date().toISOString(),
    } as any;
  }

  return row;
}

/* ------------------------------------------------------------------ */
/*  addPerformanceLesson                                               */
/* ------------------------------------------------------------------ */

export async function addPerformanceLesson(
  brandProfileId: string,
  lesson: Omit<PerformanceLesson, 'id' | 'learnedAt'>
): Promise<void> {
  const row = await loadBrandRow(brandProfileId);

  const lessons = parseJsonField<PerformanceLesson[]>(row.performanceLessons, []);
  lessons.push({
    ...lesson,
    id: crypto.randomUUID(),
    learnedAt: new Date().toISOString(),
  });

  // Trim to keep only the last 50
  const trimmed = lessons.slice(-50);

  await db
    .update(brandProfiles)
    .set({
      performanceLessons: JSON.stringify(trimmed),
      totalPostsGenerated: (row.totalPostsGenerated || 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(brandProfiles.id, brandProfileId))
    .run();

  // Also record to marketing memory
  try {
    const { recordMemoryEntry } = await import('./memoryTimelineService');
    await recordMemoryEntry({
      brandProfileId,
      entryType: 'lesson_learned',
      entryDate: new Date().toISOString(),
      weekLabel: '',
      summary: lesson.lesson.substring(0, 200),
      metrics: {
        engagementRate: lesson.engagementRate,
        contentType: lesson.contentType,
        platform: lesson.platform,
      },
      sentiment: 'neutral',
      tags: ['lesson', lesson.contentType, lesson.platform],
      linkedEntityId: null,
      linkedEntityType: null,
      lessonsJson: [lesson.lesson, lesson.whatWorked].filter(Boolean),
    });
  } catch { /* ignore */ }

  // Adaptive planning: every 10 new lessons, derive fresh behavior rules
  try {
    if (trimmed.length > 0 && trimmed.length % 10 === 0) {
      const { deriveBehaviorRules } = await import('../lib/adaptivePlanning');
      await deriveBehaviorRules(brandProfileId);
    }
  } catch (err) {
    console.warn('[BrandMemory] deriveBehaviorRules failed:', (err as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/*  addAudienceInsight                                                 */
/* ------------------------------------------------------------------ */

export async function addAudienceInsight(
  brandProfileId: string,
  insight: Omit<AudienceInsight, 'id' | 'discoveredAt'>
): Promise<void> {
  const row = await loadBrandRow(brandProfileId);

  const insights = parseJsonField<AudienceInsight[]>(row.audienceInsights, []);
  insights.push({
    ...insight,
    id: crypto.randomUUID(),
    discoveredAt: new Date().toISOString(),
  });

  // Trim to keep only the last 20
  const trimmed = insights.slice(-20);

  await db
    .update(brandProfiles)
    .set({
      audienceInsights: JSON.stringify(trimmed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(brandProfiles.id, brandProfileId))
    .run();
}

/* ------------------------------------------------------------------ */
/*  recordCampaignCompletion                                           */
/* ------------------------------------------------------------------ */

export async function recordCampaignCompletion(
  brandProfileId: string,
  campaignId: string
): Promise<void> {
  const row = await loadBrandRow(brandProfileId);

  const campaignRow = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();
  if (!campaignRow) throw new Error(`Campaign ${campaignId} not found`);

  // Load all published posts for this campaign with their metrics
  const posts = db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.campaignId, campaignId),
        eq(scheduledPosts.status, 'published')
      )
    )
    .all();

  const totalPosts = posts.length;
  let totalEngagementRate = 0;
  const contentTypeEngagement: Record<string, number[]> = {};

  for (const post of posts) {
    const meta = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const perf = meta.performance || {};
    const rate = perf.engagementRate || 0;
    totalEngagementRate += rate;

    const ct = meta.contentType || 'general';
    if (!contentTypeEngagement[ct]) contentTypeEngagement[ct] = [];
    contentTypeEngagement[ct].push(rate);
  }

  const avgEngagementRate = totalPosts > 0 ? Math.round((totalEngagementRate / totalPosts) * 100) / 100 : 0;

  // Find top performing content type by average engagement
  let topPerformingContentType = 'general';
  let bestAvg = 0;
  for (const [ct, rates] of Object.entries(contentTypeEngagement)) {
    const ctAvg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (ctAvg > bestAvg) {
      bestAvg = ctAvg;
      topPerformingContentType = ct;
    }
  }

  // Call LLM for lesson learned
  const prompt = `A marketing campaign just completed. Here are the results:
goal type ${campaignRow.goal},
total posts ${totalPosts},
average engagement rate ${avgEngagementRate}%,
follower growth during campaign N/A,
top content type ${topPerformingContentType}.
Write one sentence summarizing the most important lesson learned from this campaign for future campaigns.`;

  const lessonsText = await callWithProviderChain(
    'campaign analysis',
    async (provider, modelId) => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => 'Consistent posting with a focus on educational content drove the highest engagement. Continue prioritizing value-driven posts.'
  );

  const campaignMem: CampaignMemory = {
    campaignId,
    completedAt: new Date().toISOString(),
    goalType: campaignRow.goal,
    totalPosts,
    avgEngagementRate,
    topPerformingContentType,
    lessonsLearned: lessonsText.trim().replace(/^```\s*/i, '').replace(/```$/i, ''),
    followerGrowth: 0,
  };

  const memories = parseJsonField<CampaignMemory[]>(row.campaignMemory, []);
  memories.push(campaignMem);
  const trimmed = memories.slice(-10);

  await db
    .update(brandProfiles)
    .set({
      campaignMemory: JSON.stringify(trimmed),
      totalCampaignsRun: (row.totalCampaignsRun || 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(brandProfiles.id, brandProfileId))
    .run();
}

/* ------------------------------------------------------------------ */
/*  updateContentDNA                                                   */
/* ------------------------------------------------------------------ */

export async function updateContentDNA(brandProfileId: string): Promise<void> {
  const row = await loadBrandRow(brandProfileId);

  const lessons = parseJsonField<PerformanceLesson[]>(row.performanceLessons, []);
  const campaignsMem = parseJsonField<CampaignMemory[]>(row.campaignMemory, []);
  const insights = parseJsonField<AudienceInsight[]>(row.audienceInsights, []);

  const lessonsText = lessons
    .slice(-10)
    .map((l) => `${l.lesson} (${l.contentType}, ${l.engagementRate}%): ${l.whatWorked}`)
    .join('\n');
  const campaignsText = campaignsMem
    .slice(-5)
    .map((c) => `Campaign ${c.goalType}: ${c.lessonsLearned} (avg eng ${c.avgEngagementRate}%)`)
    .join('\n');
  const insightsText = insights
    .slice(-5)
    .map((i) => `${i.segment}: ${i.contentTheyEngageWith} (best time: ${i.bestTimeToReach})`)
    .join('\n');

  const prompt = `Based on this brand's performance history, synthesize their content DNA.

Performance lessons:
${lessonsText}

Campaign memory:
${campaignsText}

Audience insights:
${insightsText}

Return JSON with:
  strongestHooks (array of up to 5 hook styles that consistently perform well for this brand),
  avoidTheseFormats (array of up to 3 content formats that consistently underperform),
  bestPerformingTopics (array of up to 5 topic areas that resonate most with their audience),
  brandVoiceEvolution (one sentence describing how this brand's most effective voice has evolved based on performance data)`;

  const text = await callWithProviderChain(
    'content dna analysis',
    async (provider, modelId) => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => JSON.stringify({
      strongestHooks: ['Question-based hooks', 'Bold statements', 'Story-driven openings', 'Data-led headlines', 'Contrarian takes'],
      avoidTheseFormats: ['Overly promotional posts', 'Long text-only posts', 'Generic industry quotes'],
      bestPerformingTopics: ['Industry insights', 'Customer success stories', 'Product behind-the-scenes', 'Thought leadership', 'Educational how-tos'],
      brandVoiceEvolution: 'The brand voice has evolved from formal corporate to more conversational and authentic, with storytelling outperforming straightforward announcements.',
      lastUpdated: new Date().toISOString(),
    })
  );

  const dna = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '')) as ContentDNA;
  dna.lastUpdated = new Date().toISOString();

  await db
    .update(brandProfiles)
    .set({
      contentDNA: JSON.stringify(dna),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(brandProfiles.id, brandProfileId))
    .run();
}

/* ------------------------------------------------------------------ */
/*  getBrandContext — replaces buildBrandContext in brandBrainService   */
/* ------------------------------------------------------------------ */

export async function getBrandContext(brandProfileId: string, topic: string): Promise<string> {
  const row = await loadBrandRow(brandProfileId);
  const sanitizedTopic = sanitizeUserInput(topic);

  const toneKeywords = row.toneKeywordsJson || '[]';
  const totalPosts = row.totalPostsGenerated || 0;
  const totalCampaigns = row.totalCampaignsRun || 0;

  const contentDNA = parseJsonField<ContentDNA>(row.contentDNA, {
    strongestHooks: [],
    avoidTheseFormats: [],
    bestPerformingTopics: [],
    brandVoiceEvolution: '',
    lastUpdated: '',
  });

  const lessons = parseJsonField<PerformanceLesson[]>(row.performanceLessons, []);
  const last5Lessons = lessons.slice(-5).map((l) => `${l.lesson} (${l.whatWorked})`).join('; ');

  const insights = parseJsonField<AudienceInsight[]>(row.audienceInsights, []);
  const topInsights = insights.slice(0, 3).map((i) => `${i.segment}: ${i.contentTheyEngageWith}`).join('; ');

  // Get relevant examples from vector store
  let vectorExamples = '';
  try {
    const examples = await getRelevantExamples(brandProfileId, sanitizedTopic);
    vectorExamples = examples.length > 0
      ? examples.map((e, i) => `Example ${i + 1}: ${sanitizeUserInput(e)}`).join('\n')
      : 'No closely matching examples found.';
  } catch {
    vectorExamples = 'Vector store not available.';
  }

  let result = [
    'BRAND MEMORY CONTEXT —',
    `Name: ${sanitizeUserInput(row.name)}.`,
    `Audience: ${row.audience}.`,
    `Voice: ${toneKeywords}.`,
    `Voice fingerprint: ${row.voiceFingerprint || 'N/A'}.`,
    '',
    `CONTENT DNA (learned from ${totalPosts} posts and ${totalCampaigns} campaigns):`,
    `Hooks that work for this brand: ${contentDNA.strongestHooks.join(', ') || 'Not yet determined'}.`,
    `Formats to avoid: ${contentDNA.avoidTheseFormats.join(', ') || 'None identified'}.`,
    `Topics that resonate: ${contentDNA.bestPerformingTopics.join(', ') || 'Not yet determined'}.`,
    `Voice evolution: ${contentDNA.brandVoiceEvolution || 'Still being learned.'}.`,
    '',
    `RECENT LESSONS (last 5): ${last5Lessons || 'No lessons recorded yet.'}`,
    '',
    `AUDIENCE INSIGHTS: ${topInsights || 'No audience insights recorded yet.'}`,
    '',
    'RELEVANT EXAMPLES (from vector store):',
    vectorExamples,
  ].join('\n');

  // Append marketing memory context
  try {
    const { getMemoryContext } = await import('./memoryTimelineService');
    const memoryContext = await getMemoryContext(brandProfileId);
    if (memoryContext) {
      result += memoryContext;
    }
  } catch {
    // Memory timeline service not available
  }

  return result;
}
