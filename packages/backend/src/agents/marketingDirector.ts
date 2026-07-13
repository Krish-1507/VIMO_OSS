/**
 * Marketing Director — Central Orchestrator
 *
 * Acts as the CMO for a brand. Coordinates four specialized workers in sequence:
 *   runResearchWorker  →  runAnalyticsWorker  →  runContentWorker  →  runEngagementWorker  →  synthesize
 *
 * Each worker collects raw data; the synthesize node calls the LLM to produce
 * a directorSummary and a prioritized list of RecommendedAction items.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import crypto from 'crypto';
import { cachedLLMText } from '../lib/llmCache';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  brandProfiles,
  scheduledPosts,
  accountSnapshots,
  engagementQueue,
  directorSessions,
  agentLogs,
  trendSignals,
  opportunities,
  approvalRequests,
  higgsfieldJobs,
  marketingMemory,
  competitorSnapshots,
  competitorProfiles,
} from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';
import { io } from '../index';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type DirectorTrigger =
  | 'scheduled_daily'
  | 'scheduled_weekly'
  | 'user_requested'
  | 'post_published'
  | 'campaign_completed';

export interface RecommendedAction {
  id: string;
  category: 'create_content' | 'adjust_strategy' | 'engage_with_audience' | 'monitor_competitor' | 'capitalize_trend';
  title: string;
  reasoning: string;
  urgency: 'do_now' | 'do_today' | 'do_this_week';
  estimatedImpact: string;
  actionPayload: Record<string, unknown>;
  explanation?: import('../lib/explainer').Explanation;
}

export interface Opportunity {
  id: string;
  type: 'trend_to_capitalize' | 'competitor_alert' | 'engagement_needed' | 'momentum_concern' | 'content_ready' | 'video_ready' | 'approval_waiting' | 'unimplemented_lesson';
  title: string;
  description: string;
  potentialImpact: string;
  urgency: 'act_now' | 'act_today' | 'act_this_week';
  actionLabel: string;
  actionType: 'navigate' | 'execute' | 'approve_all';
  actionPayload: Record<string, unknown>;
  isActedOn: boolean;
  detectedAt: string;
}

export interface MorningBriefing {
  greeting: string;
  opportunityCount: number;
  opportunities: Opportunity[];
  potentialTotalImpact: string;
  generatedAt: string;
}

export interface MarketingDirectorState {
  brandProfileId: string;
  sessionId: string;
  trigger: DirectorTrigger;
  researchReport: {
    packInsights?: string;
    packInsightCount?: number;
    trends: Array<Record<string, unknown>>;
    competitorMoves: Array<Record<string, unknown>>;
    opportunities: Array<Record<string, unknown>>;
    unansweredComments: number;
    momentumConcern: boolean;
    completedVideos: number;
    pendingApprovals: number;
    unimplementedLessons: number;
    competitorAlerts: number;
    collectedAt: string;
  } | null;
  generatedOpportunities: Opportunity[] | null;
  contentOpportunities: Array<Record<string, unknown>> | null;
  analyticsInsights: {
    overallHealthScore: number;
    trend: 'improving' | 'stable' | 'declining';
    keyInsight: string;
    topPerformingContentType: string;
    underperformingAreas: string[];
    audienceEngagementPattern: string;
  } | null;
  engagementStats: {
    totalPending: number;
    highPriorityCount: number;
    autoRepliedToday: number;
    trendingConversations: string[];
  } | null;
  directorSummary: string | null;
  recommendedActions: RecommendedAction[] | null;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function logAgentAction(params: {
  action: string;
  input: string;
  output: string;
  status: string;
  durationMs: number;
}) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    agentType: 'marketing_director',
    action: params.action,
    input: params.input,
    output: params.output,
    connectorsCalled: '',
    status: params.status,
    durationMs: params.durationMs,
    createdAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/*  Node 1 — runResearchWorker                                        */
/* ------------------------------------------------------------------ */

/**
 * Gather pack insights for the Marketing Director.
 */
async function enrichWithPackInsights(brandProfileId: string): Promise<{
  packContext: string;
  packInsightCount: number;
}> {
  try {
    const { getPackInsightsPromptBlock } = await import('../services/packInsightsService');
    const packContext = await getPackInsightsPromptBlock(brandProfileId);
    const lineCount = packContext.split('\n').filter(l => l.trim().length > 0).length;
    return {
      packContext,
      packInsightCount: lineCount,
    };
  } catch (err) {
    console.warn('[Director] Pack insights unavailable:', (err as Error).message);
    return { packContext: '', packInsightCount: 0 };
  }
}

async function runResearchWorker(state: MarketingDirectorState): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(`[Director] runResearchWorker — gathering intelligence for brand ${state.brandProfileId}...`);

  try {
    // Import the three existing agents and call them in parallel
    const { huntTrends: origHuntTrends } = await import('./trendHunterAgent');
    const { analyzeCompetitors: origAnalyzeCompetitors } = await import('./competitorAgent');
    const { scanOpportunities: origScanOpportunities } = await import('./opportunityAgent');

    const [trendsResult, competitorResult, oppResult] = await Promise.allSettled([
      (async () => {
        await origHuntTrends(state.brandProfileId);
        return 'trend hunter complete';
      })(),
      (async () => {
        await origAnalyzeCompetitors(state.brandProfileId);
        return 'competitor analysis complete';
      })(),
      (async () => {
        await origScanOpportunities(state.brandProfileId);
        return 'opportunity scan complete';
      })(),
    ]);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const last3Days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const last6Days = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    const { eq, and, gte, lte, sql } = await import('drizzle-orm');

    // 1. Get recent trend signals for this brand
    const trends = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'trending_topic'),
        ),
      )
      .all();

    // 2. Get competitor moves as signals
    const competitorMoves = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'competitor_move'),
        ),
      )
      .all();

    // 3. Get growth opportunities as signals
    const growthOpps = db
      .select()
      .from(trendSignals)
      .where(
        and(
          gte(trendSignals.createdAt, last24h),
          eq(trendSignals.signalType, 'growth_opportunity'),
        ),
      )
      .all();

    // 4. Check unanswered comments > 2 hours
    const unansweredComments = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId),
          eq(engagementQueue.status, 'pending'),
          lte(engagementQueue.createdAt, twoHoursAgo)
        )
      )
      .get();
    const unansweredCount = (unansweredComments as any)?.count ?? 0;

    // 5. Follower momentum drop > 20%
    const recentSnapshots = db
      .select()
      .from(accountSnapshots)
      .where(gte(accountSnapshots.snapshotDate, last6Days.split('T')[0]))
      .orderBy(accountSnapshots.snapshotDate)
      .all();
    
    let momentumConcern = false;
    if (recentSnapshots.length >= 2) {
      const older = recentSnapshots.filter(s => s.snapshotDate < last3Days.split('T')[0]);
      const newer = recentSnapshots.filter(s => s.snapshotDate >= last3Days.split('T')[0]);
      
      const oldChange = older.length > 1 ? older[older.length-1].followersCount - older[0].followersCount : 0;
      const newChange = newer.length > 1 ? newer[newer.length-1].followersCount - newer[0].followersCount : 0;
      
      if (oldChange > 0 && newChange < oldChange * 0.8) {
        momentumConcern = true; // Drop > 20% compared to previous 3 days
      }
    }

    // 6. Completed Higgsfield jobs in last 24h
    const completedVideos = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(higgsfieldJobs)
      .where(
        and(
          eq(higgsfieldJobs.brandProfileId, state.brandProfileId),
          eq(higgsfieldJobs.status, 'completed'),
          gte(higgsfieldJobs.completedAt, last24h)
        )
      )
      .get();
    const videoCount = (completedVideos as any)?.count ?? 0;

    // 7. Pending approvals > 6 hours
    const pendingApprovals = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.brandProfileId, state.brandProfileId),
          eq(approvalRequests.status, 'pending'),
          lte(approvalRequests.createdAt, sixHoursAgo)
        )
      )
      .get();
    const approvalCount = (pendingApprovals as any)?.count ?? 0;

    // 8. Unimplemented lessons in marketingMemory
    const unimplementedLessons = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(marketingMemory)
      .where(
        and(
          eq(marketingMemory.brandProfileId, state.brandProfileId),
          gte(marketingMemory.createdAt, last7Days)
        )
      )
      .get(); // Simplification: assume all recent lessons might need review
    const lessonCount = (unimplementedLessons as any)?.count ?? 0;

    // 10. Gather pack insights
    const { packContext, packInsightCount } = await enrichWithPackInsights(state.brandProfileId);

    // 9. Competitor gain > 200 followers in 24h
    const compSnaps = db
      .select()
      .from(competitorSnapshots)
      .where(gte(competitorSnapshots.snapshotDate, last48h.split('T')[0]))
      .all();
    let compAlerts = 0;
    const comps = new Map<string, number[]>();
    for (const c of compSnaps) {
      if (!comps.has(c.competitorProfileId)) comps.set(c.competitorProfileId, []);
      if (c.followersCount !== null) {
        comps.get(c.competitorProfileId)!.push(c.followersCount);
      }
    }
    for (const [, counts] of comps) {
      if (counts.length >= 2) {
        if (counts[counts.length-1] - counts[0] > 200) compAlerts++;
      }
    }

    const researchReport = {
      packInsights: packContext,
      packInsightCount,
      trends: trends.map((t) => ({
        title: t.title,
        description: t.description,
        relevanceScore: t.relevanceScore,
        actionSuggestion: t.actionSuggestion,
      })),
      competitorMoves: competitorMoves.map((c) => ({
        title: c.title,
        description: c.description,
        relevanceScore: c.relevanceScore,
        actionSuggestion: c.actionSuggestion,
      })),
      opportunities: growthOpps.map((o) => ({
        title: o.title,
        description: o.description,
        relevanceScore: o.relevanceScore,
        actionSuggestion: o.actionSuggestion,
      })),
      unansweredComments: unansweredCount,
      momentumConcern,
      completedVideos: videoCount,
      pendingApprovals: approvalCount,
      unimplementedLessons: lessonCount,
      competitorAlerts: compAlerts,
      collectedAt: new Date().toISOString(),
    };

    io?.emit('director:research_complete', { complete: true });

    await logAgentAction({
      action: 'runResearchWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: JSON.stringify({ trends: trends.length, opportunities: growthOpps.length }),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { researchReport };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] runResearchWorker error:`, msg);
    await logAgentAction({
      action: 'runResearchWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return { researchReport: { packInsights: '', packInsightCount: 0, trends: [], competitorMoves: [], opportunities: [], unansweredComments: 0, momentumConcern: false, completedVideos: 0, pendingApprovals: 0, unimplementedLessons: 0, competitorAlerts: 0, collectedAt: new Date().toISOString() } };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 2 — runAnalyticsWorker                                       */
/* ------------------------------------------------------------------ */

async function runAnalyticsWorker(state: MarketingDirectorState): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(`[Director] runAnalyticsWorker — analyzing performance for brand ${state.brandProfileId}...`);

  try {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Query last 7 days of published posts
    const posts = db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.brandProfileId, state.brandProfileId),
          eq(scheduledPosts.status, 'published'),
          gte(scheduledPosts.scheduledAt, last7Days),
        ),
      )
      .all();

    const postData = posts.map((p) => {
      const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
      const perf = meta.performance || {};
      return {
        platform: p.platform,
        content: p.content.substring(0, 100),
        likes: perf.likes ?? 0,
        comments: perf.comments ?? 0,
        reach: perf.reach ?? 0,
        saves: perf.saves ?? 0,
        shares: perf.shares ?? 0,
        engagementRate: perf.engagementRate ?? 0,
      };
    });

    // Query follower change from account_snapshots
    const snapshots = db
      .select()
      .from(accountSnapshots)
      .where(gte(accountSnapshots.snapshotDate, last7Days.split('T')[0]))
      .all();

    const followerData: { current: number; previous: number; change: number } = {
      current: snapshots.length > 0 ? snapshots[snapshots.length - 1].followersCount : 0,
      previous: snapshots.length > 1 ? snapshots[0].followersCount : 0,
      change: 0,
    };
    followerData.change = followerData.current - followerData.previous;

    // Get brand profile for performance lessons
    const brandRow = db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, state.brandProfileId))
      .get();

    const lessons = brandRow?.performanceLessons
      ? (() => {
          try {
            return JSON.parse(brandRow.performanceLessons);
          } catch {
            return [];
          }
        })()
      : [];

    const prompt = `You are a marketing analytics expert. Summarize the performance of this brand's last 7 days.

Post data: ${JSON.stringify(postData)}
Follower change: ${JSON.stringify(followerData)}
Historical lessons: ${JSON.stringify(lessons)}

Return JSON:
{
  "overallHealthScore": number 0-100,
  "trend": "improving" | "stable" | "declining",
  "keyInsight": string (one sentence, the single most important thing happening right now),
  "topPerformingContentType": string,
  "underperformingAreas": string[],
  "audienceEngagementPattern": string
}`;

    const text = await cachedLLMText('analytics insights', prompt, {
      context: { brandId: state.brandProfileId },
      fallback: () =>
        JSON.stringify({
          overallHealthScore: 50,
          trend: 'stable',
          keyInsight: 'Brand is maintaining steady performance with room for growth.',
          topPerformingContentType: 'social_post',
          underperformingAreas: ['Engagement rate could be improved'],
          audienceEngagementPattern: 'Audience engages primarily in the evenings.',
        }),
    });

    const analyticsInsights = JSON.parse(
      text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''),
    );

    console.log(
      `[Director] runAnalyticsWorker — health score: ${analyticsInsights.overallHealthScore}, trend: ${analyticsInsights.trend}`,
    );

    io?.emit('director:analytics_complete', {
      overallHealthScore: analyticsInsights.overallHealthScore,
      trend: analyticsInsights.trend,
    });

    await logAgentAction({
      action: 'runAnalyticsWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: JSON.stringify({ overallHealthScore: analyticsInsights.overallHealthScore, trend: analyticsInsights.trend }),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { analyticsInsights };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] runAnalyticsWorker error:`, msg);
    await logAgentAction({
      action: 'runAnalyticsWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return {
      analyticsInsights: {
        overallHealthScore: 50,
        trend: 'stable',
        keyInsight: 'Analytics data could not be processed. Manual review recommended.',
        topPerformingContentType: 'unknown',
        underperformingAreas: [],
        audienceEngagementPattern: 'Data unavailable.',
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 3 — runContentWorker                                         */
/* ------------------------------------------------------------------ */

async function runContentWorker(state: Partial<MarketingDirectorState>): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(`[Director] runContentWorker — identifying content opportunities for brand ${state.brandProfileId}...`);

  try {
    const researchReport = state.researchReport;
    const analyticsInsights = state.analyticsInsights;

    const brandRow = db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, state.brandProfileId!))
      .get();

    const brandContext = brandRow
      ? JSON.stringify({
          name: brandRow.name,
          industry: brandRow.industry,
          audience: brandRow.audience,
          toneKeywords: brandRow.toneKeywordsJson,
        })
      : 'Unknown brand';

    const prompt = `You are a content strategist. Based on this intelligence, identify the best content opportunities for the next 48 hours.

Research data: ${JSON.stringify(researchReport)}
Analytics health: ${JSON.stringify(analyticsInsights)}
Brand context: ${brandContext}

Return a JSON array of up to 5 content opportunities, each with:
  platform (string),
  topic (string),
  contentType (string),
  hook (string — the specific opening line to use),
  urgency (string — "post_today" or "post_this_week"),
  reasoning (string — one sentence explaining why this content will perform well right now),
  videoSuggestion (object or null — if the platform is "instagram" or "tiktok" and the content type benefits from video (educational, storytelling, promotional), provide:
    generate: true,
    suggestedPrompt: string — a specific Higgsfield prompt derived from the content opportunity topic and hook, describing the cinematic video to generate for it
  )`;

    const text = await cachedLLMText('content strategy', prompt, {
      context: { brandId: state.brandProfileId },
      fallback: () =>
        JSON.stringify([
          {
            platform: 'instagram',
            topic: 'Share recent wins or updates from your brand',
            contentType: 'carousel',
            hook: 'Here\'s what we\'ve been working on...',
            urgency: 'post_today',
            reasoning: 'Keeping your audience updated builds trust and engagement.',
          },
        ]),
    });

    const contentOpportunities = JSON.parse(
      text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''),
    );

    const opportunities = Array.isArray(contentOpportunities)
      ? contentOpportunities
      : contentOpportunities.opportunities || [];

    console.log(`[Director] runContentWorker — identified ${opportunities.length} content opportunities`);

    // Enrich each opportunity with knowledge-graph context for the detected
    // content type. This adds relationship-backed reasoning that the
    // frontend can show in the opportunity card.
    let enrichedCount = 0;
    try {
      const { queryKnowledge } = await import('../services/knowledgeGraphService');
      for (const opp of opportunities) {
        const ct = (opp as any).contentType as string | undefined;
        if (!ct) continue;
        const result = await queryKnowledge({
          brandProfileId: state.brandProfileId!,
          entityType: 'content_type',
          entityLabel: ct,
        });
        if (!result) continue;
        const strongWells = result.strongPerformsWellWith.filter((r) => r.strength >= 0.5);
        if (strongWells.length === 0) continue;
        const sampleSize = strongWells[0].sampleSize;
        const pieces: string[] = [];
        for (const r of strongWells.slice(0, 3)) {
          pieces.push(
            `${ct} performs well with ${r.entity.entityLabel} (${r.entity.entityType.replace('_', ' ')})`
          );
        }
        if ((opp as any).description) {
          (opp as any).description = `${(opp as any).description} — ${pieces.join('; ')}; backed by ${sampleSize} data points in your history.`;
        } else {
          (opp as any).description = `${pieces.join('; ')}; backed by ${sampleSize} data points in your history.`;
        }
        enrichedCount++;
      }
    } catch (err) {
      console.warn(`[Director] runContentWorker — knowledge graph enrichment failed:`, (err as Error).message);
    }
    console.log(
      `[Director] runContentWorker — enriched ${enrichedCount}/${opportunities.length} opportunities with knowledge graph data`
    );

    io?.emit('director:content_complete', { count: opportunities.length });

    await logAgentAction({
      action: 'runContentWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: `Found ${opportunities.length} content opportunities`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { contentOpportunities: opportunities.slice(0, 5) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] runContentWorker error:`, msg);
    await logAgentAction({
      action: 'runContentWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return { contentOpportunities: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 4 — runEngagementWorker                                      */
/* ------------------------------------------------------------------ */

async function runEngagementWorker(state: Partial<MarketingDirectorState>): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(`[Director] runEngagementWorker — analyzing engagement for brand ${state.brandProfileId}...`);

  try {
    // Get total pending items for this brand
    const totalPending = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId!),
          eq(engagementQueue.status, 'pending'),
        ),
      )
      .get();

    // High priority = purchase_intent or complaint from metadata
    const highPriorityItems = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId!),
          eq(engagementQueue.status, 'pending'),
          gte(engagementQueue.confidenceScore, 70),
        ),
      )
      .get();

    // Count auto-replied today
    const todayStart = new Date().toISOString().split('T')[0];
    const autoRepliedToday = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId!),
          eq(engagementQueue.replyStatus, 'sent'),
          gte(engagementQueue.updatedAt, todayStart),
        ),
      )
      .get();

    // Identify trending topics in recent comments
    const recentComments = db
      .select({ content: engagementQueue.content, confidenceScore: engagementQueue.confidenceScore })
      .from(engagementQueue)
      .where(
        and(
          eq(engagementQueue.brandProfileId, state.brandProfileId!),
          eq(engagementQueue.status, 'pending'),
        ),
      )
      .orderBy(desc(engagementQueue.createdAt))
      .limit(20)
      .all();

    // Extract common words/topics from comments (simple heuristic)
    const wordFrequency = new Map<string, number>();
    for (const comment of recentComments) {
      if (!comment.content) continue;
      const words = comment.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const word of words) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }
    const trendingConversations = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    const engagementStats = {
      totalPending: (totalPending as unknown as { count: number })?.count ?? 0,
      highPriorityCount: (highPriorityItems as unknown as { count: number })?.count ?? 0,
      autoRepliedToday: (autoRepliedToday as unknown as { count: number })?.count ?? 0,
      trendingConversations,
    };

    console.log(
      `[Director] runEngagementWorker — ${engagementStats.totalPending} pending, ${engagementStats.highPriorityCount} high priority`,
    );

    io?.emit('director:engagement_complete', {
      totalPending: engagementStats.totalPending,
      highPriorityCount: engagementStats.highPriorityCount,
    });

    await logAgentAction({
      action: 'runEngagementWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: JSON.stringify(engagementStats),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { engagementStats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] runEngagementWorker error:`, msg);
    await logAgentAction({
      action: 'runEngagementWorker',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return {
      engagementStats: {
        totalPending: 0,
        highPriorityCount: 0,
        autoRepliedToday: 0,
        trendingConversations: [],
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 5 — synthesize                                                */
/* ------------------------------------------------------------------ */

async function synthesize(state: Partial<MarketingDirectorState>): Promise<Partial<MarketingDirectorState>> {
  const start = Date.now();
  console.log(`[Director] synthesize — Marketing Director analyzing all reports...`);

  try {
    const { eq, and, lte } = await import('drizzle-orm');
    
    const brandRow = db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, state.brandProfileId!))
      .get();

    const brandContext = brandRow
      ? JSON.stringify({
          name: brandRow.name,
          industry: brandRow.industry,
          audience: brandRow.audience,
        })
      : 'Unknown brand';

    // Extract pack insights from research report for prominent display
    const packInsightsStr = (state.researchReport as any)?.packInsights || '';

    const prompt = `You are the proactive Marketing Director for this brand. Your team has given you the following reports.
Research: ${JSON.stringify(state.researchReport)}
Content opportunities: ${JSON.stringify(state.contentOpportunities)}
Brand context: ${brandContext}

${packInsightsStr ? `=== Installed Pack Intelligence ===
The following data comes from the brand's installed packs (Knowledge Packs, Intelligence Packs, Creative & Commerce Packs). Use this data to generate opportunities that leverage these insights naturally.
${packInsightsStr}

=== End Pack Intelligence ===
` : ''}

Your job: produce a prioritized list of Opportunities based on ALL of the above signals — including the pack intelligence data.
When pack data is available, ALWAYS generate at least one opportunity per active pack (e.g. GitHub activity → content opportunity, Shopify sales → campaign opportunity, competitor tracking → market gap opportunity).

For each opportunity, output:
- type (enum: trend_to_capitalize, competitor_alert, engagement_needed, momentum_concern, content_ready, video_ready, approval_waiting, unimplemented_lesson)
- title (short, specific, no jargon)
- description (one sentence explaining what VIMO found)
- potentialImpact (e.g. "+14% engagement" or "+80 followers/week" - be specific, derive from historical data)
- urgency (enum: act_now, act_today, act_this_week)
- actionLabel (e.g. "Create content", "Reply to comments", "Schedule video", "Approve posts")
- actionType (enum: navigate, execute, approve_all)
- actionPayload (object - data needed to execute: for navigate, the route; for execute, the function and params; for approve_all, the request type)

Return JSON:
{
  "executiveSummary": "string",
  "opportunities": [
    {
      "type": "...",
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "urgency": "...",
      "actionLabel": "...",
      "actionType": "...",
      "actionPayload": {}
    }
  ]
}`;

    const text = await cachedLLMText('marketing director synthesis', prompt, {
      context: { brandId: state.brandProfileId },
      fallback: () =>
        JSON.stringify({
          executiveSummary: 'Routine check complete.',
          opportunities: []
        }),
    });

    const parsed = JSON.parse(text.trim().replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, ''));

    const directorSummary = parsed.executiveSummary || '';
    const opps: Opportunity[] = (parsed.opportunities || []).map((o: any) => ({
      id: crypto.randomUUID(),
      type: o.type,
      title: o.title,
      description: o.description,
      potentialImpact: o.potentialImpact,
      urgency: o.urgency,
      actionLabel: o.actionLabel,
      actionType: o.actionType,
      actionPayload: o.actionPayload || {},
      isActedOn: false,
      detectedAt: new Date().toISOString()
    }));

    // Knowledge-graph: surface unimplemented_lesson opportunities backed by
    // high-confidence relationships (strength > 0.8, sample size > 10).
    try {
      const { findUnimplementedLessons } = await import('../services/knowledgeGraphService');
      const lessons = await findUnimplementedLessons(state.brandProfileId!);
      for (const lesson of lessons) {
        opps.push({
          id: crypto.randomUUID(),
          type: 'unimplemented_lesson',
          title: lesson.title,
          description: lesson.description,
          potentialImpact: lesson.potentialImpact,
          urgency: lesson.urgency,
          actionLabel: 'Create content',
          actionType: 'navigate',
          actionPayload: {
            route: '/content-studio',
            topic: lesson.sourceEntity.entityLabel,
            contentType: lesson.sourceEntity.entityType,
          },
          isActedOn: false,
          detectedAt: new Date().toISOString(),
        });
      }
      if (lessons.length > 0) {
        console.log(`[Director] synthesize — added ${lessons.length} unimplemented_lesson opportunities from knowledge graph`);
      }
    } catch (err) {
      console.warn(`[Director] synthesize — knowledge graph unimplemented_lessons failed:`, (err as Error).message);
    }

    const now = new Date();
    
    // Purge unacted-on opportunities older than 48 hours for this brand
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    db.delete(opportunities)
      .where(
        and(
          eq(opportunities.brandProfileId, state.brandProfileId!),
          eq(opportunities.isActedOn, 0),
          lte(opportunities.createdAt, fortyEightHoursAgo)
        )
      ).run();

    // Insert new opportunities
    for (const opp of opps) {
      db.insert(opportunities).values({
        id: opp.id,
        brandProfileId: state.brandProfileId!,
        type: opp.type,
        title: opp.title,
        description: opp.description,
        potentialImpact: opp.potentialImpact,
        urgency: opp.urgency,
        actionLabel: opp.actionLabel,
        actionType: opp.actionType,
        actionPayloadJson: JSON.stringify(opp.actionPayload),
        isActedOn: 0,
        detectedAt: opp.detectedAt,
        actedOnAt: null,
        createdAt: now.toISOString()
      }).run();
    }

    // Save director session to DB
    const sessionId = state.sessionId || crypto.randomUUID();

    await db.insert(directorSessions).values({
      id: sessionId,
      brandProfileId: state.brandProfileId!,
      trigger: state.trigger!,
      researchReportJson: state.researchReport ? JSON.stringify(state.researchReport) : null,
      analyticsInsightsJson: state.analyticsInsights ? JSON.stringify(state.analyticsInsights) : null,
      contentOpportunitiesJson: state.contentOpportunities ? JSON.stringify(state.contentOpportunities) : null,
      engagementStatsJson: state.engagementStats ? JSON.stringify(state.engagementStats) : null,
      directorSummary,
      recommendedActionsJson: JSON.stringify([]), // legacy field
      morningBriefingJson: null,
      createdAt: now.toISOString(),
    });

    console.log(`[Director] synthesize — Saved session ${sessionId} with ${opps.length} opportunities`);

    // Emit socket event
    io?.emit('director:session_complete', {
      sessionId,
      directorSummary,
      opportunities: opps,
    });

    await logAgentAction({
      action: 'synthesize',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: `Saved director session ${sessionId} with ${opps.length} opportunities`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return {
      directorSummary,
      generatedOpportunities: opps,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] synthesize error:`, msg);
    await logAgentAction({
      action: 'synthesize',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    return {
      directorSummary: 'The Marketing Director encountered an error while synthesizing results. Please try again.',
      generatedOpportunities: [],
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Graph Wiring                                                       */
/* ------------------------------------------------------------------ */

const DirectorStateAnnotation = Annotation.Root({
  brandProfileId: Annotation<string>,
  sessionId: Annotation<string>,
  trigger: Annotation<DirectorTrigger>,
  researchReport: Annotation<MarketingDirectorState['researchReport']>,
  generatedOpportunities: Annotation<MarketingDirectorState['generatedOpportunities']>,
  contentOpportunities: Annotation<MarketingDirectorState['contentOpportunities']>,
  analyticsInsights: Annotation<MarketingDirectorState['analyticsInsights']>,
  engagementStats: Annotation<MarketingDirectorState['engagementStats']>,
  directorSummary: Annotation<string | null>,
  recommendedActions: Annotation<MarketingDirectorState['recommendedActions']>,
  completedAt: Annotation<string | null>,
});

const graph = new StateGraph(DirectorStateAnnotation)
  .addNode('runResearchWorker', runResearchWorker)
  .addNode('runAnalyticsWorker', runAnalyticsWorker)
  .addNode('runContentWorker', runContentWorker)
  .addNode('runEngagementWorker', runEngagementWorker)
  .addNode('synthesize', synthesize)
  .addEdge(START, 'runResearchWorker')
  .addEdge('runResearchWorker', 'runAnalyticsWorker')
  .addEdge('runAnalyticsWorker', 'runContentWorker')
  .addEdge('runContentWorker', 'runEngagementWorker')
  .addEdge('runEngagementWorker', 'synthesize')
  .addEdge('synthesize', END)
  .compile();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Runs the full Director pipeline (research → analytics → content → engagement
 * → synthesize) to completion and returns the sessionId. Iterating the graph
 * stream is what actually drives node execution — awaiting the generator
 * object alone would not run the workers.
 *
 * Exported so the orchestration can be tested deterministically; it is also the
 * function the public `runMarketingDirector` delegates to.
 */
export async function runDirectorPipeline(params: {
  brandProfileId: string;
  trigger: DirectorTrigger;
  sessionId: string;
}): Promise<string> {
  const { brandProfileId, trigger, sessionId } = params;
  const start = Date.now();
  console.log(`[Director] runDirectorPipeline — session ${sessionId}, trigger: ${trigger}`);

  try {
    const initialState: MarketingDirectorState = {
      brandProfileId,
      sessionId,
      trigger,
      researchReport: null,
      generatedOpportunities: null,
      contentOpportunities: null,
      analyticsInsights: null,
      engagementStats: null,
      directorSummary: null,
      recommendedActions: null,
      completedAt: null,
    };

    // Drive the graph to completion. `invoke` runs every worker node and
    // returns the final state — awaiting the generator object alone (the old
    // `graph.stream(...)` call) does not execute the pipeline.
    await graph.invoke(initialState, {
      recursionLimit: 50,
      configurable: { thread_id: `director_${sessionId}` },
    });

    console.log(`[Director] runDirectorPipeline — session ${sessionId} completed in ${Date.now() - start}ms`);

    await logAgentAction({
      action: 'runMarketingDirector',
      input: JSON.stringify(params),
      output: `Session ${sessionId} completed successfully`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return sessionId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Director] runDirectorPipeline error for session ${sessionId}:`, msg);

    await logAgentAction({
      action: 'runMarketingDirector',
      input: JSON.stringify(params),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });

    throw err;
  }
}

export async function runMarketingDirector(params: {
  brandProfileId: string;
  trigger: DirectorTrigger;
}): Promise<string> {
  const sessionId = crypto.randomUUID();

  // Run in non-blocking background context so the HTTP request returns
  // immediately while the Director works.
  setImmediate(() => {
    runDirectorPipeline({ ...params, sessionId }).catch(() => {
      // Errors are already logged inside runDirectorPipeline.
    });
  });

  return sessionId;
}

/**
 * Mark a recommended action as executed.
 * Stores the executed action within the session's recommendedActionsJson.
 */
export async function markActionExecuted(
  sessionId: string,
  actionId: string,
): Promise<void> {
  const session = db
    .select()
    .from(directorSessions)
    .where(eq(directorSessions.id, sessionId))
    .get();

  if (!session) {
    throw new Error(`Director session ${sessionId} not found`);
  }

  const actions: RecommendedAction[] = session.recommendedActionsJson
    ? JSON.parse(session.recommendedActionsJson)
    : [];

  const updatedActions = actions.map((a) => {
    if (a.id === actionId) {
      return { ...a, executedAt: new Date().toISOString() };
    }
    return a;
  });

  await db
    .update(directorSessions)
    .set({
      recommendedActionsJson: JSON.stringify(updatedActions),
    })
    .where(eq(directorSessions.id, sessionId))
    .run();
}

export async function generateMorningBriefing(brandProfileId: string): Promise<MorningBriefing | null> {
  const { eq, and, desc } = await import('drizzle-orm');
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  let greeting = 'Good morning.';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon.';
  else if (hour >= 17) greeting = 'Good evening.';
  else if (day === 1) greeting = 'Good Monday morning.';

  const pendingOpps = db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.brandProfileId, brandProfileId),
        eq(opportunities.isActedOn, 0)
      )
    )
    .all();

  if (pendingOpps.length === 0) {
    return null; // No briefing needed if no ops
  }

  const mappedOpps: Opportunity[] = pendingOpps.map(r => ({
    id: r.id,
    type: r.type as any,
    title: r.title,
    description: r.description,
    potentialImpact: r.potentialImpact,
    urgency: r.urgency as any,
    actionLabel: r.actionLabel,
    actionType: r.actionType as any,
    actionPayload: JSON.parse(r.actionPayloadJson || '{}'),
    isActedOn: Boolean(r.isActedOn),
    detectedAt: r.detectedAt
  }));

  greeting += ` VIMO found ${mappedOpps.length} opportunit${mappedOpps.length === 1 ? 'y' : 'ies'} while you were away.`;

  const briefing: MorningBriefing = {
    greeting,
    opportunityCount: mappedOpps.length,
    opportunities: mappedOpps,
    potentialTotalImpact: 'Multiple improvements across engagement and reach.', // Simpler combined logic
    generatedAt: now.toISOString()
  };

  const latestSession = db
    .select()
    .from(directorSessions)
    .where(eq(directorSessions.brandProfileId, brandProfileId))
    .orderBy(desc(directorSessions.createdAt))
    .limit(1)
    .get();

  if (latestSession) {
    db.update(directorSessions)
      .set({ morningBriefingJson: JSON.stringify(briefing) })
      .where(eq(directorSessions.id, latestSession.id))
      .run();
  }

  return briefing;
}
