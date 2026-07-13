/**
 * Marketing Time Machine Service — answers questions like "Why did my growth slow down?"
 * or "When did my engagement start dropping?" by analyzing 12 weeks of historical data.
 */

import { callWithProviderChain } from '../lib/llmProvider';

/* ------------------------------------------------------------------ */
/*  TypeScript Interfaces                                              */
/* ------------------------------------------------------------------ */

export interface TimelineEvent {
  weekLabel: string;
  date: string;
  event: string;
  metric: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  detail: string;
}

export interface MarketingTimeline {
  question: string;
  timelineEvents: TimelineEvent[];
  narrative: string;
  rootCause: string;
  recommendation: string;
}

/* ------------------------------------------------------------------ */
/*  buildTimeline — now uses memoryTimelineService.generateMemoryInsight */
/* ------------------------------------------------------------------ */

export async function buildTimeline(params: {
  brandProfileId: string;
  question: string;
}): Promise<MarketingTimeline> {
  const { brandProfileId, question } = params;

  // Use the new memory timeline service for the insight
  const { generateMemoryInsight, getWeeklyGroupedTimeline } = await import('./memoryTimelineService');

  // Get the insight text
  const insight = await generateMemoryInsight(brandProfileId, question);

  // Get the weekly grouped data for building timeline events
  const weeklyGroups = await getWeeklyGroupedTimeline(brandProfileId, 12);

  const timelineEvents: TimelineEvent[] = weeklyGroups
    .filter((g) => g.entries.length > 0 || g.postCount > 0)
    .map((g) => ({
      weekLabel: g.weekLabel,
      date: g.startDate,
      event: g.postCount > 0
        ? `Posted ${g.postCount} time${g.postCount > 1 ? 's' : ''}`
        : `${g.entries.length} events recorded`,
      metric: g.netFollowerChange !== 0
        ? `${g.netFollowerChange > 0 ? '+' : ''}${g.netFollowerChange} followers`
        : `${g.avgEngagementRate}% engagement`,
      sentiment: (g.netFollowerChange > 0 || g.avgEngagementRate > 3) ? 'positive' :
        (g.netFollowerChange === 0 && g.postCount === 0) ? 'neutral' : 'negative',
      detail: g.weekSummary,
    }));

  // Extract narrative, root cause, and recommendation from the LLM insight
  const narrative = insight;
  
  // Determine root cause from the data
  const zeroPostWeeks = weeklyGroups.filter((g) => g.postCount === 0).length;
  const totalWeeks = weeklyGroups.length;
  let rootCause = 'Overall performance is relatively stable.';
  let recommendation = 'Continue your current posting momentum and experiment with new content formats to drive higher engagement rates.';

  if (zeroPostWeeks > totalWeeks / 3) {
    rootCause = 'Inconsistent posting schedule appears to be the main factor affecting performance. Weeks with no posts directly correlate with lower engagement and follower growth.';
    recommendation = 'Create a consistent weekly posting schedule of at least 3-4 posts per week. Use the scheduler to batch-create content in advance so there are no zero-posting weeks.';
  }

  return {
    question,
    timelineEvents: timelineEvents.slice(-12),
    narrative,
    rootCause,
    recommendation,
  };
}
