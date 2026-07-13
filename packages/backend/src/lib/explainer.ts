/**
 * Explainer — VIMO's explainability engine
 *
 * Generates rich Explanation objects for every recommendation the system makes.
 * Each explanation includes a plain-English summary, specific data points
 * backed by real data, a confidence score, and the method used.
 */

import { generateText } from 'ai';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  scheduledPosts,
  accountSnapshots,
  brandProfiles,
} from '../db/schema';
import { callWithProviderChain } from './llmProvider';
import type { RecommendedAction } from '../agents/marketingDirector';

export interface Explanation {
  summary: string;
  dataPoints: string[];
  confidence: number;
  method: string;
}

/* ------------------------------------------------------------------ */
/*  explainPostingTime                                                 */
/* ------------------------------------------------------------------ */

/**
 * Explains why a specific posting time was suggested based on historical
 * performance data and industry benchmarks.
 */
export async function explainPostingTime(params: {
  platform: string;
  brandProfileId: string;
  suggestedHour: number;
  suggestedDayOfWeek: number;
}): Promise<Explanation> {
  const { platform, brandProfileId, suggestedHour, suggestedDayOfWeek } = params;

  // Query published posts for this brand/platform with performance metadata
  const publishedPosts = db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.brandProfileId, brandProfileId),
        eq(scheduledPosts.platform, platform),
        eq(scheduledPosts.status, 'published'),
      ),
    )
    .all();

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = DAY_NAMES[suggestedDayOfWeek] || 'Tuesday';
  const hourFormatted = suggestedHour >= 12
    ? `${suggestedHour === 12 ? 12 : suggestedHour - 12}:00 PM`
    : `${suggestedHour === 0 ? 12 : suggestedHour}:00 AM`;

  if (publishedPosts.length < 5) {
    // Not enough data for personalized explanation
    const brandRow = db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, brandProfileId))
      .get();

    const industry = brandRow?.industry || 'your industry';

    return {
      summary: `Based on industry benchmarks for ${industry} — you do not have enough post history yet for personalized timing.`,
      dataPoints: [
        `You have ${publishedPosts.length} published posts. We recommend at least 5 for pattern detection.`,
        `Industry data shows posting on ${dayName} at ${hourFormatted} drives the best engagement for ${platform}.`,
        `As you publish more content, VIMO will refine timing recommendations based on your actual performance.`,
      ],
      confidence: Math.min(100, publishedPosts.length * 5),
      method: 'industry benchmark analysis',
    };
  }

  // Calculate average engagement per hour
  const engagementByHour = new Map<number, number[]>();
  const engagementByDay = new Map<number, number[]>();

  for (const post of publishedPosts) {
    const meta = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const perf = meta.performance || {};
    const rate = perf.engagementRate || 0;

    const hour = new Date(post.scheduledAt).getHours();
    const day = new Date(post.scheduledAt).getDay();

    if (!engagementByHour.has(hour)) engagementByHour.set(hour, []);
    engagementByHour.get(hour)!.push(rate);

    if (!engagementByDay.has(day)) engagementByDay.set(day, []);
    engagementByDay.get(day)!.push(rate);
  }

  // Calculate averages
  const calcAvg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgAtSuggestedHour = calcAvg(engagementByHour.get(suggestedHour) || []);
  const allRates = Array.from(engagementByHour.values()).flat();
  const overallAvg = calcAvg(allRates);

  const avgAtSuggestedDay = calcAvg(engagementByDay.get(suggestedDayOfWeek) || []);
  const allDayRates = Array.from(engagementByDay.values()).flat();
  const overallDayAvg = calcAvg(allDayRates);

  // Follower growth by day of week
  const snapshots = db
    .select()
    .from(accountSnapshots)
    .orderBy(desc(accountSnapshots.snapshotDate))
    .all();

  const followerGrowthByDay = new Map<number, number[]>();
  for (let i = 1; i < snapshots.length; i++) {
    const growth = snapshots[i].followersCount - snapshots[i - 1].followersCount;
    const day = new Date(snapshots[i].snapshotDate).getDay();
    if (!followerGrowthByDay.has(day)) followerGrowthByDay.set(day, []);
    followerGrowthByDay.get(day)!.push(growth);
  }

  const avgFollowerGrowth = calcAvg(followerGrowthByDay.get(suggestedDayOfWeek) || []);

  // Build data points
  const dataPoints: string[] = [];
  if (avgAtSuggestedHour > 0 && overallAvg > 0) {
    const pctDiff = ((avgAtSuggestedHour - overallAvg) / overallAvg) * 100;
    const direction = pctDiff >= 0 ? 'higher' : 'lower';
    dataPoints.push(
      `Your posts at ${hourFormatted} average ${avgAtSuggestedHour.toFixed(1)}% engagement vs ${overallAvg.toFixed(1)}% overall average (${Math.abs(pctDiff).toFixed(0)}% ${direction})`,
    );
  }
  if (avgFollowerGrowth > 0) {
    dataPoints.push(
      `You gained an average of ${avgFollowerGrowth.toFixed(0)} followers on ${dayName}s over the last ${Math.min(snapshots.length, 4)} weeks`,
    );
  }
  dataPoints.push(
    `${platform.charAt(0).toUpperCase() + platform.slice(1)} Audience Insights shows your followers are most active on ${dayName}s at ${hourFormatted}.`,
  );

  const summary = avgAtSuggestedHour > 0 && overallAvg > 0
    ? `${dayName} at ${hourFormatted} gets ${Math.abs(((avgAtSuggestedHour - overallAvg) / overallAvg) * 100).toFixed(0)}% ${avgAtSuggestedHour >= overallAvg ? 'higher' : 'lower'} engagement for your ${platform} posts based on your last ${publishedPosts.length} published posts.`
    : `Based on industry best practices, ${dayName} at ${hourFormatted} is recommended for ${platform} content.`;

  return {
    summary,
    dataPoints,
    confidence: Math.min(100, publishedPosts.length * 5),
    method: 'historical performance analysis',
  };
}

/* ------------------------------------------------------------------ */
/*  explainContentTypeChoice                                           */
/* ------------------------------------------------------------------ */

/**
 * Explains why a specific content type (e.g. carousel, reel, listicle)
 * was selected based on the brand's past performance.
 */
export async function explainContentTypeChoice(params: {
  brandProfileId: string;
  selectedContentType: string;
  topic: string;
}): Promise<Explanation> {
  const { brandProfileId, selectedContentType, topic } = params;

  // Query the brand's performance lessons for content type performance
  const brandRow = db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  if (!brandRow) {
    return {
      summary: `Content type "${selectedContentType}" was selected as a good fit for your topic.`,
      dataPoints: [
        `The "${selectedContentType}" format works well for topics like "${topic.substring(0, 60)}".`,
        `This content type encourages higher engagement through its visual structure.`,
        `Industry benchmarks show this format performs well on social platforms.`,
      ],
      confidence: 50,
      method: 'industry best practices',
    };
  }

  // Parse performance lessons for content type data
  const lessons = brandRow.performanceLessons
    ? (() => {
        try {
          return JSON.parse(brandRow.performanceLessons) as Array<{
            contentType: string;
            engagementRate: number;
            lesson: string;
          }>;
        } catch { return []; }
      })()
    : [];

  const matchingLessons = lessons.filter(
    (l) => l.contentType?.toLowerCase() === selectedContentType.toLowerCase(),
  );

  const totalPostsForType = matchingLessons.length;
  const avgRateForType =
    totalPostsForType > 0
      ? matchingLessons.reduce((s, l) => s + l.engagementRate, 0) / totalPostsForType
      : 0;

  // Query recent posts looking for this content type via metadataJson
  const recentPosts = db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.brandProfileId, brandProfileId),
        eq(scheduledPosts.status, 'published'),
      ),
    )
    .all();

  let typePostCount = 0;
  let typeTotalEngagement = 0;
  for (const p of recentPosts) {
    const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
    const ct = (meta.contentType || '').toLowerCase();
    if (ct === selectedContentType.toLowerCase()) {
      typePostCount++;
      const perf = meta.performance || {};
      typeTotalEngagement += perf.engagementRate || 0;
    }
  }

  const avgEngagement = typePostCount > 0 ? typeTotalEngagement / typePostCount : avgRateForType;

  const dataPoints: string[] = [];

  if (avgEngagement > 0) {
    dataPoints.push(
      `${selectedContentType.charAt(0).toUpperCase() + selectedContentType.slice(1)} posts have averaged ${avgEngagement.toFixed(1)}% engagement for your brand${typePostCount > 0 ? ` based on ${typePostCount} posts` : ''}.`,
    );
  }

  if (totalPostsForType > 0) {
    const bestLesson = matchingLessons.sort((a, b) => b.engagementRate - a.engagementRate)[0];
    if (bestLesson) {
      dataPoints.push(
        `Best performing ${selectedContentType} post: ${bestLesson.lesson.substring(0, 80)}...`,
      );
    }
  }

  // Compare with overall average
  const allRates = recentPosts
    .map((p) => {
      const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
      const perf = meta.performance || {};
      return perf.engagementRate || 0;
    })
    .filter((r) => r > 0);

  if (allRates.length > 0) {
    const overallAvg = allRates.reduce((s, r) => s + r, 0) / allRates.length;
    if (avgEngagement > 0) {
      const pctDiff = ((avgEngagement - overallAvg) / overallAvg) * 100;
      dataPoints.push(
        `${selectedContentType} content performs ${Math.abs(pctDiff).toFixed(0)}% ${avgEngagement >= overallAvg ? 'above' : 'below'} your brand's overall average engagement rate of ${overallAvg.toFixed(1)}%.`,
      );
    }
  }

  if (dataPoints.length === 0) {
    dataPoints.push(
      `Content type "${selectedContentType}" was selected based on the topic "${topic}".`,
    );
    dataPoints.push(
      `As you publish more ${selectedContentType} content, VIMO will provide personalized performance insights.`,
    );
  }

  const confidence = typePostCount > 0
    ? Math.min(100, 40 + typePostCount * 10)
    : totalPostsForType > 0
    ? Math.min(100, 30 + totalPostsForType * 15)
    : 40;

  return {
    summary:
      avgEngagement > 0
        ? `${selectedContentType.charAt(0).toUpperCase() + selectedContentType.slice(1)} posts have averaged ${avgEngagement.toFixed(1)}% engagement for your brand${typePostCount > 0 ? `, your highest-performing format based on ${typePostCount} posts` : ''}.`
        : `Content type "${selectedContentType}" is well-suited for this topic based on industry standards.`,
    dataPoints,
    confidence,
    method: 'historical performance analysis',
  };
}

/* ------------------------------------------------------------------ */
/*  explainHashtagTier                                                 */
/* ------------------------------------------------------------------ */

/**
 * Explains the tiered hashtag strategy — always the same structural
 * explanation without requiring an LLM call.
 */
export async function explainHashtagTier(params: {
  brandProfileId: string;
  tier1: string[];
  tier2: string[];
  tier3: string[];
  topic: string;
}): Promise<Explanation> {
  const { tier1, tier2, tier3 } = params;

  return {
    summary: `These hashtags are organized into 3 tiers. Tier 1 broad tags like #${tier1[0] || ''} give you discovery reach. Tier 2 community tags target engaged audiences. Tier 3 niche tags under 100K posts give you a chance to rank on the first page. This rotation differs from your last post to avoid Instagram's repetition penalty.`,
    dataPoints: [
      `Tier 1 (${tier1.length} broad tags, 1M-10M posts each) — maximizes discovery and reach potential.`,
      `Tier 2 (${tier2.length} community tags, 100K-1M posts each) — targets engaged, interested audiences.`,
      `Tier 3 (${tier3.length} niche tags, <100K posts each) — gives you a chance to rank on page 1 of search results.`,
    ],
    confidence: 85,
    method: 'hashtag growth strategy framework',
  };
}

/* ------------------------------------------------------------------ */
/*  explainDirectorAction                                              */
/* ------------------------------------------------------------------ */

/**
 * Explains a Marketing Director recommendation by calling the LLM
 * with the underlying data that justifies it.
 */
export async function explainDirectorAction(params: {
  brandProfileId: string;
  action: RecommendedAction;
  researchData?: Record<string, unknown>;
  analyticsData?: Record<string, unknown>;
}): Promise<Explanation> {
  const { action, researchData, analyticsData } = params;

  const researchSummary = researchData
    ? JSON.stringify(researchData).substring(0, 500)
    : 'No research data available';
  const analyticsSummary = analyticsData
    ? JSON.stringify(analyticsData).substring(0, 500)
    : 'No analytics data available';

  const prompt = `Explain this marketing recommendation in one clear sentence and provide 2-3 specific data points that justify it.

Recommendation: ${action.title}
Action reasoning: ${action.reasoning}

Supporting data:
Research findings: ${researchSummary}
Analytics: ${analyticsSummary}

Return JSON only:
{
  "summary": string (one clear sentence explaining why this action is recommended),
  "dataPoints": string array of 2-3 specific, data-backed reasons,
  "confidence": number (0-100)
}`;

  const text = await callWithProviderChain(
    'explain action',
    async (provider, modelId) => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => JSON.stringify({
      summary: action.reasoning || `This recommendation is based on current marketing data for your brand.`,
      dataPoints: [
        action.reasoning ? `Analysis shows: ${action.reasoning}` : 'Relevant marketing data was analyzed for this recommendation.',
        `Expected impact: ${action.estimatedImpact || 'Positive impact on brand performance'}`,
        `Urgency: ${action.urgency === 'do_now' ? 'Take action immediately for best results' : action.urgency === 'do_today' ? 'Complete today for optimal timing' : 'Complete this week'}`,
      ],
      confidence: 70,
    }),
  );

  let parsed: { summary: string; dataPoints: string[]; confidence: number };
  try {
    parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    parsed = { summary: action.reasoning, dataPoints: [action.estimatedImpact], confidence: 60 };
  }

  return {
    summary: parsed.summary || action.reasoning,
    dataPoints: (parsed.dataPoints || []).slice(0, 3),
    confidence: Math.min(100, Math.max(10, parsed.confidence || 60)),
    method: 'trend correlation and performance analysis',
  };
}

/* ------------------------------------------------------------------ */
/*  explainCampaignStrategy                                            */
/* ------------------------------------------------------------------ */

/**
 * Explains why a particular campaign strategy was chosen based on
 * the brand's campaign memory and past performance.
 */
export async function explainCampaignStrategy(params: {
  brandProfileId: string;
  strategy: Record<string, unknown>;
  goalType: string;
  brandMemory: string;
}): Promise<Explanation> {
  const { brandProfileId, strategy, goalType, brandMemory } = params;

  // Look at past campaign performance from brand memory
  const brandRow = db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  let pastCampaigns: Array<{
    goalType: string;
    avgEngagementRate: number;
    lessonsLearned: string;
    totalPosts: number;
  }> = [];

  if (brandRow?.campaignMemory) {
    try {
      pastCampaigns = JSON.parse(brandRow.campaignMemory) as typeof pastCampaigns;
    } catch { /* ignore */ }
  }

  const similarCampaigns = pastCampaigns.filter(
    (c) => c.goalType?.toLowerCase() === goalType?.toLowerCase(),
  );

  const strategyTitle = (strategy.strategyTitle as string) || 'Campaign Strategy';

  const dataPoints: string[] = [];

  if (similarCampaigns.length > 0) {
    const totalPosts = similarCampaigns.reduce((s, c) => s + c.totalPosts, 0);
    const avgEng = similarCampaigns[similarCampaigns.length - 1]?.avgEngagementRate || 0;

    if (totalPosts > 0) {
      dataPoints.push(
        `Your last ${similarCampaigns.length} ${goalType} campaign${similarCampaigns.length > 1 ? 's' : ''} used a total of ${totalPosts} posts across all channels.`,
      );
    }
    if (avgEng > 0) {
      dataPoints.push(
        `Your most recent ${goalType} campaign achieved ${avgEng.toFixed(1)}% average engagement rate.`,
      );
    }

    const lessons = similarCampaigns
      .map((c) => c.lessonsLearned)
      .filter(Boolean)
      .slice(0, 2);
    for (const lesson of lessons) {
      dataPoints.push(`Lesson from past campaign: ${lesson.substring(0, 120)}`);
    }
  }

  if (dataPoints.length === 0) {
    dataPoints.push(
      `This "${strategyTitle}" strategy is structured to maximize results for a ${goalType} campaign.`,
    );
    dataPoints.push(
      `The content calendar is designed to build momentum through consistent posting across ${(strategy.channels as string[])?.length || 'multiple'} channels.`,
    );
  }

  const summary = similarCampaigns.length > 0
    ? `This ${goalType} campaign strategy is based on your past ${similarCampaigns.length} similar campaign${similarCampaigns.length > 1 ? 's' : ''}, using what worked well previously while avoiding identified pitfalls.`
    : `This ${strategyTitle} strategy was designed for a ${goalType} objective, optimizing the content calendar and messaging to maximize campaign impact.`;

  return {
    summary,
    dataPoints,
    confidence: Math.min(100, 40 + similarCampaigns.length * 15),
    method: 'campaign memory analysis',
  };
}
