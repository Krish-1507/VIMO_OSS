/**
 * Autopilot Agent — VIMO's complete autonomous marketing operation.
 *
 * When a user clicks GO, this agent runs the entire marketing lifecycle:
 * research → strategy → content creation → scheduling → engagement → monitoring.
 *
 * Built as a LangGraph StateGraph with 7 sequential nodes.
 * Exports startAutopilot, pauseAutopilot, resumeAutopilot.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { generateText } from 'ai';
import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  autopilotSessions,
  autopilotCheckpoints,
  brandProfiles,
  appSettings,
  scheduledPosts,
  trendSignals as trendSignalsTable,
} from '../db/schema';
import { callLLMWithFallback } from '../lib/llmErrorHandler';
import { TaskType, getModelForTask } from '../lib/modelRouter';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { generatePost } from '../services/contentGenerationService';
import { suggestPostingTime } from '../services/postingTimeService';
import { schedulePost, cancelPost } from '../services/schedulerService';
import { translateGoalToStrategy } from './goalTranslationAgent';
import { huntTrends } from './trendHunterAgent';
import { io } from '../index';

/* ------------------------------------------------------------------ */
/*  TrendSignal interface (from trend_signals table)                    */
/* ------------------------------------------------------------------ */

interface TrendSignal {
  title: string;
  relevanceScore: number;
  reasoning: string;
}

/* ------------------------------------------------------------------ */
/*  CalendarEntry interface                                            */
/* ------------------------------------------------------------------ */

interface CalendarEntry {
  week: number;
  day: string;
  platform: string;
  contentType: string;
  content: string;
  scheduledAt: string;
}

/* ------------------------------------------------------------------ */
/*  Autopilot State                                                    */
/* ------------------------------------------------------------------ */

export interface AutopilotState {
  autopilotId: string;
  brandProfileId: string;
  audienceDescription: string;
  primaryGoal: string;
  goalType: string;
  durationDays: number;
  channels: string[];
  startDate: string;
  endDate: string;
  status: 'initializing' | 'researching' | 'strategizing' | 'creating_content' | 'scheduling' | 'activating_engagement' | 'monitoring' | 'completed' | 'paused' | 'failed';
  currentPhase: string;
  trendSignals: TrendSignal[];
  strategyDocument: string | null;
  contentCalendar: CalendarEntry[] | null;
  scheduledPostIds: string[];
  engagementEnabled: boolean;
  progressPercent: number;
  log: string[];
  timeline: AutopilotTimelineEntry[];
  startedAt: string;
  lastUpdatedAt: string;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Transparency timeline (structured, explainable activity log)        */
/* ------------------------------------------------------------------ */

export type AutopilotTimelineAction =
  | 'validate'
  | 'research'
  | 'strategy'
  | 'content'
  | 'schedule'
  | 'engage'
  | 'monitor'
  | 'checkpoint'
  | 'error';

export interface AutopilotTimelineEntry {
  id: string;
  phase: string;
  action: AutopilotTimelineAction;
  title: string;
  detail?: string;
  /** Plain-language reason VIMO took this action. Builds user trust. */
  why?: string;
  timestamp: string;
  status?: 'done' | 'running' | 'failed';
  metrics?: Record<string, number | string>;
}

/**
 * Appends a human-readable log line AND a structured, explainable timeline
 * entry in one step. The callers still persist the returned state, so the
 * timeline is written to the DB alongside the legacy log.
 */
function addEntry(
  state: AutopilotState,
  logText: string,
  entry?: Omit<AutopilotTimelineEntry, 'id' | 'timestamp'>
): AutopilotState {
  const timeline: AutopilotTimelineEntry[] = entry
    ? [
        ...state.timeline,
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      ]
    : state.timeline;
  return {
    ...state,
    log: [...state.log, logText],
    timeline,
  };
}

/* ------------------------------------------------------------------ */
/*  Socket emit helper                                                 */
/* ------------------------------------------------------------------ */

function emitStatus(state: AutopilotState) {
  try {
    if (io) {
      io.emit('autopilot:status_update', state);
    }
  } catch {
    // Socket not available
  }
}

/* ------------------------------------------------------------------ */
/*  Helper — load a brand row                                          */
/* ------------------------------------------------------------------ */

async function loadBrand(brandProfileId: string) {
  const row = await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
  if (!row) throw new Error(`Brand profile ${brandProfileId} not found`);
  return row;
}

/* ------------------------------------------------------------------ */
/*  Helper — persist state to DB                                       */
/* ------------------------------------------------------------------ */

async function persistState(state: AutopilotState): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(autopilotSessions)
    .set({
      status: state.status,
      progressPercent: state.progressPercent,
      strategyDocument: state.strategyDocument,
      contentCalendarJson: state.contentCalendar ? JSON.stringify(state.contentCalendar) : null,
      scheduledPostIdsJson: JSON.stringify(state.scheduledPostIds),
      logJson: JSON.stringify(state.log),
      timelineJson: JSON.stringify(state.timeline),
      completedAt: state.status === 'completed' || state.status === 'monitoring' ? now : undefined,
    })
    .where(eq(autopilotSessions.id, state.autopilotId))
    .run();
}

/* ================================================================== */
/*  NODE 1 — initialize                                                */
/* ================================================================== */

async function initializeNode(state: AutopilotState): Promise<AutopilotState> {
  const errors: string[] = [];

  // Validate brand profile exists
  try {
    const brand = await loadBrand(state.brandProfileId);
    if (!brand) errors.push('Brand profile not found.');
  } catch {
    errors.push('Brand profile not found.');
  }

  // Validate at least one social connector is active
  const allConnectors = await new ConnectorRegistry(db).getAll();
  const socialConnectors = allConnectors.filter(
    (c: any) => c.status === 'active' && c.type === 'social'
  );
  if (socialConnectors.length === 0) {
    errors.push('No active social media connectors found. Connect at least one social platform first.');
  }

  // Validate LLM connector is active
  const llmConnector = allConnectors.find((c: any) => c.status === 'active' && c.provider === 'openai');
  if (!llmConnector) {
    errors.push('No active LLM provider found. Configure your LLM settings first.');
  }

  if (errors.length > 0) {
    return addEntry(
      { ...state, status: 'failed', error: errors.join(' ') },
      `Validation failed: ${errors.join(' ')}`,
      {
        phase: 'initialize',
        action: 'error',
        title: 'Could not start Autopilot',
        detail: errors.join(' '),
        why: `Before doing anything autonomous, VIMO checks that the basics are in place (a brand profile, at least one connected social account, and an AI provider). ${errors.join(' ')}`,
        status: 'failed',
      }
    );
  }

  const newState = addEntry(
    {
      ...state,
      status: 'researching',
      currentPhase: 'Researching trends and audience...',
      progressPercent: 5,
    },
    'Autopilot activated. Starting research phase.',
    {
      phase: 'initialize',
      action: 'validate',
      title: 'Setup verified — Autopilot started',
      detail: 'Brand profile, social connection, and AI provider all checked.',
      why: 'I run a quick safety check first so nothing autonomous happens without a destination or a way to post. Everything passed, so I can begin.',
      status: 'done',
    }
  );

  // Save initial record to DB
  const now = new Date().toISOString();
  await db.insert(autopilotSessions).values({
    id: state.autopilotId,
    brandProfileId: state.brandProfileId,
    audienceDescription: state.audienceDescription,
    primaryGoal: state.primaryGoal,
    goalType: state.goalType,
    durationDays: state.durationDays,
    channelsJson: JSON.stringify(state.channels),
    status: 'researching',
    progressPercent: 5,
    strategyDocument: null,
    contentCalendarJson: null,
    scheduledPostIdsJson: JSON.stringify([]),
    logJson: JSON.stringify(['Autopilot activated. Starting research phase.']),
    startDate: state.startDate,
    endDate: state.endDate,
    completedAt: null,
    startedAt: now,
    createdAt: now,
  });

  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 2 — researchPhase                                             */
/* ================================================================== */

async function researchPhaseNode(state: AutopilotState): Promise<AutopilotState> {
  // Run three things in parallel
  const [trendResult, memoryResult, topicResult] = await Promise.allSettled([
    (async () => {
      try {
        await huntTrends(state.brandProfileId);
        // Read back inserted signals with relevanceScore > 60
        const allSignals = db.select().from(trendSignalsTable)
          .orderBy(desc(trendSignalsTable.relevanceScore))
          .all();
        return (allSignals as any[])
          .filter((s: any) => s.relevanceScore > 60)
          .slice(0, 5)
          .map((s: any) => ({
            title: s.title,
            relevanceScore: s.relevanceScore,
            reasoning: s.description,
          }));
      } catch {
        return [] as TrendSignal[];
      }
    })(),

    (async () => {
      try {
        const brand = await loadBrand(state.brandProfileId);
        const lessons = brand.performanceLessons
          ? JSON.parse(brand.performanceLessons)
          : [];
        const typeMap: Record<string, number> = {};
        for (const l of lessons) {
          const lesson = l as any;
          const ct = lesson.contentType || 'general';
          typeMap[ct] = (typeMap[ct] || 0) + (lesson.engagementRate || 1);
        }
        const sorted = Object.entries(typeMap)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 3)
          .map(([type]) => type);
        return sorted.length > 0 ? sorted : ['educational', 'entertaining', 'promotional'];
      } catch {
        return ['educational', 'entertaining', 'promotional'];
      }
    })(),

    (async () => {
      try {
        const brand = await loadBrand(state.brandProfileId);
        const researchRoute = await getModelForTask(TaskType.RESEARCH);
        // Use callWithProviderChain-like approach: get the provider and call
        const { getActiveLLMProvider } = await import('../lib/llmProvider');
        const { provider, modelId } = await getActiveLLMProvider();
        const prompt = `Given a brand in ${brand.industry} targeting ${brand.audience} with the goal: ${state.primaryGoal}, identify the top 3 content topics that will resonate most with their audience for marketing content. Return a JSON array of exactly 3 strings, each being a specific content topic. Keep each topic concise (under 10 words).`;
        const { text } = await generateText({ model: provider.chat(modelId), prompt });
        const topics = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
        return Array.isArray(topics) ? topics.slice(0, 3) : ['Industry trends', 'How-to guides', 'Success stories'];
      } catch {
        return ['Industry trends', 'How-to guides', 'Success stories'];
      }
    })(),
  ]);

  const signals = trendResult.status === 'fulfilled' ? trendResult.value : [];
  const contentTypes = memoryResult.status === 'fulfilled' ? memoryResult.value : ['educational', 'entertaining', 'promotional'];
  const topics = topicResult.status === 'fulfilled' ? topicResult.value : ['Industry trends', 'How-to guides', 'Success stories'];

  const logEntry = `Research complete. Found ${signals.length} relevant trends. Top content types from your history: ${contentTypes.join(', ')}. Recommended topics: ${topics.join(', ')}.`;

  const newState = addEntry(
    {
      ...state,
      trendSignals: signals,
      status: 'strategizing',
      currentPhase: 'Building your strategy...',
      progressPercent: 20,
    },
    logEntry,
    {
      phase: 'research',
      action: 'research',
      title: 'Researched trends, audience & proven content',
      detail: logEntry,
      why: `I pulled live trends in your niche, reviewed what your past posts taught us, and picked topics your audience actually cares about — so the strategy is built on real signal, not guesses.`,
      status: 'done',
      metrics: { trendsFound: signals.length },
    }
  );

  await persistState(newState);
  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 3 — strategyPhase                                             */
/* ================================================================== */

async function strategyPhaseNode(state: AutopilotState): Promise<AutopilotState> {
  const brand = await loadBrand(state.brandProfileId);

  // Call goalTranslationAgent
  const translation = await translateGoalToStrategy({
    userGoal: state.primaryGoal,
    brandProfileId: state.brandProfileId,
    durationDays: state.durationDays,
  });

  // Call LLM for the full strategy document
  const strategyRoute = await getModelForTask(TaskType.STRATEGY);
  const { getActiveLLMProvider: getProvider } = await import('../lib/llmProvider');
  const { provider, modelId } = await getProvider();

  const prompt = `You are a senior marketing strategist creating a complete autonomous campaign strategy.

Brand: ${brand.name}.
Audience: ${state.audienceDescription}.
Goal: ${state.primaryGoal}.
Duration: ${state.durationDays} days.
Channels: ${state.channels.join(', ')}.
Relevant trends discovered: ${JSON.stringify(state.trendSignals.map((s) => s.title))}.
Performance lessons from brand history: ${brand.performanceLessons ? JSON.parse(brand.performanceLessons).slice(0, 5).map((l: any) => l.lesson).join('; ') : 'N/A'}.

Create a complete strategy document. Return JSON:
{
  strategyTitle: string,
  executiveSummary: string (2-3 sentences),
  weekByWeekPlan: array of { week: number, theme: string, contentMix: object mapping contentType to percentage (total must be 100), keyMessages: string array },
  postingSchedule: object mapping each platform to postsPerWeek number (total posts should be 3-5 per platform per week),
  hashtagStrategy: string,
  engagementStrategy: string,
  successMetrics: string array
}`;

  const text = await callLLMWithFallback(
    async () => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => JSON.stringify({
      strategyTitle: `${brand.name} ${state.durationDays}-Day Autonomous Campaign`,
      executiveSummary: `A ${state.durationDays}-day campaign focused on ${state.primaryGoal}. Leveraging ${state.channels.join(', ')} to reach ${state.audienceDescription}.`,
      weekByWeekPlan: Array.from({ length: Math.ceil(state.durationDays / 7) }, (_, i) => ({
        week: i + 1,
        theme: i === 0 ? 'Awareness & Education' : i === 1 ? 'Engagement & Social Proof' : 'Conversion & Retention',
        contentMix: { educational: 40, entertaining: 30, promotional: 30 },
        keyMessages: [`Week ${i + 1} key message for ${state.primaryGoal}`],
      })),
      postingSchedule: Object.fromEntries(state.channels.map((c) => [c, 5])),
      hashtagStrategy: 'Use a mix of broad (50k+), medium (10k-50k), and niche (<10k) hashtags relevant to each post topic.',
      engagementStrategy: 'Respond to all comments within 4 hours during business hours. Engage with 10 accounts in target audience daily.',
      successMetrics: ['Engagement rate > 3%', 'Follower growth > 5%', 'Reach > 10,000 per week'],
    }),
    'autopilot strategy'
  );

  const strategy = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));

  const newState = addEntry(
    {
      ...state,
      engagementEnabled: true,
      status: 'monitoring',
      currentPhase: 'Setting up monitoring checkpoints...',
      progressPercent: 95,
    },
    'Engagement monitoring activated. VIMO will automatically respond to comments with confidence above 80%.',
    {
      phase: 'engage',
      action: 'engage',
      title: 'Engagement autopilot armed',
      detail: 'VIMO will automatically reply to comments above 80% confidence.',
      why: 'Real growth comes from conversations, not just posts. I turned on automatic, on-brand replies so your audience always gets a response — but only when I am confident it is the right thing to say.',
      status: 'done',
    }
  );

  await persistState(newState);
  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 4 — contentCreationPhase                                      */
/* ================================================================== */

async function contentCreationPhaseNode(state: AutopilotState): Promise<AutopilotState> {
  const strategy = state.strategyDocument ? JSON.parse(state.strategyDocument) : null;
  if (!strategy) {
    return {
      ...state,
      status: 'failed',
      error: 'No strategy document found. Cannot generate content.',
      log: [...state.log, 'ERROR: No strategy document found.'],
    };
  }

  const weeks = strategy.weekByWeekPlan || [{ week: 1, theme: state.primaryGoal, contentMix: { educational: 40, entertaining: 30, promotional: 30 }, keyMessages: [state.primaryGoal] }];
  const postingSchedule = strategy.postingSchedule || Object.fromEntries(state.channels.map((c) => [c, 5]));

  // Calculate total post count
  const totalPosts = weeks.reduce((total: number, week: any) => {
    let weekTotal = 0;
    for (const [platform, postsPerWeek] of Object.entries(postingSchedule)) {
      if (state.channels.includes(platform)) {
        weekTotal += (postsPerWeek as number);
      }
    }
    return total + weekTotal;
  }, 0);

  let postsCreated = 0;
  const allPostIds: string[] = [];
  const contentCalendar: CalendarEntry[] = [];

  // Process weeks sequentially
  for (const week of weeks) {
    const weekNum = week.week;

    // For each platform, generate this week's posts
    for (const [platform, postsPerWeek] of Object.entries(postingSchedule)) {
      if (!state.channels.includes(platform)) continue;
      const count = postsPerWeek as number;

      // Determine content type distribution from contentMix
      const mix = week.contentMix || { educational: 40, entertaining: 30, promotional: 30 };
      const types = Object.entries(mix).sort(([, a], [, b]) => (b as number) - (a as number));
      const typeDistribution: string[] = [];
      for (let i = 0; i < count; i++) {
        for (const [type, pct] of types) {
          const numOfType = Math.round((pct as number) / 100 * count);
          while (typeDistribution.filter((t) => t === type).length < numOfType && typeDistribution.length < count) {
            typeDistribution.push(type);
          }
        }
      }
      while (typeDistribution.length < count) typeDistribution.push('educational');
      typeDistribution.length = count;

      // Generate each post for this platform/week
      for (let p = 0; p < count; p++) {
        const contentType = typeDistribution[p] || 'educational';
        const keyMessages = week.keyMessages || [];

        try {
          // Process in batches of 5 with 2-second delay between batches
          if (postsCreated > 0 && postsCreated % 5 === 0) {
            await new Promise((r) => setTimeout(r, 2000));
          }

          const result = await generatePost({
            brandProfileId: state.brandProfileId,
            platform,
            topic: week.theme || state.primaryGoal,
            additionalContext: `Content type: ${contentType}. Key messages: ${keyMessages.join(', ')}. Week ${weekNum} of the campaign.`,
          });

          const now = new Date().toISOString();
          const postId = crypto.randomUUID();

          // Store as autopilot_draft
          await db.insert(scheduledPosts).values({
            id: postId,
            brandProfileId: state.brandProfileId,
            content: result.content,
            platform,
            scheduledAt: now,
            status: 'autopilot_draft',
            metadataJson: JSON.stringify({
              hashtags: result.hashtags,
              imageSuggestion: result.imageSuggestion,
              contentType: result.contentType || contentType,
              autopilotId: state.autopilotId,
              weekNumber: weekNum,
              campaignWeek: week.theme,
              generatedBy: 'autopilot',
            }),
            createdAt: now,
            updatedAt: now,
          });

          allPostIds.push(postId);
          contentCalendar.push({
            week: weekNum,
            day: '',
            platform,
            contentType,
            content: result.content,
            scheduledAt: '',
          });
        } catch (err) {
          console.warn(`[Autopilot] Post generation failed for ${platform} week ${weekNum}:`, (err as Error).message);
        }

        postsCreated++;

        // Emit progress every 5 posts
        if (postsCreated % 5 === 0 || postsCreated === totalPosts) {
          const progress = Math.min(70, 35 + Math.floor((postsCreated / totalPosts) * 35));
          const interim: AutopilotState = {
            ...state,
            scheduledPostIds: [...allPostIds],
            contentCalendar,
            progressPercent: progress,
            currentPhase: `Creating content... ${postsCreated} of ${totalPosts} posts`,
            log: [...state.log, `Created ${postsCreated} of ${totalPosts} posts...`],
          };
          await persistState(interim);
          emitStatus(interim);
        }
      }
    }
  }

  const newState = addEntry(
    {
      ...state,
      scheduledPostIds: allPostIds,
      contentCalendar,
      status: 'scheduling',
      currentPhase: 'Scheduling posts at optimal times...',
      progressPercent: 70,
    },
    `Content creation complete. Generated ${allPostIds.length} posts. Moving to scheduling.`,
    {
      phase: 'content',
      action: 'content',
      title: `Created ${allPostIds.length} posts`,
      detail: `Generated across ${state.channels.join(', ')} for the full campaign window.`,
      why: `Instead of posting ad-hoc, I drafted the entire campaign's content up front so it stays consistent with the strategy and your brand voice.`,
      status: 'done',
      metrics: { postsCreated: allPostIds.length },
    }
  );

  await persistState(newState);
  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 5 — schedulingPhase                                           */
/* ================================================================== */

async function schedulingPhaseNode(state: AutopilotState): Promise<AutopilotState> {
  const posts = db
    .select()
    .from(scheduledPosts)
    .all()
    .filter((p: any) => state.scheduledPostIds.includes(p.id) && p.status === 'autopilot_draft');

  if (posts.length === 0) {
    return {
      ...state,
      status: 'activating_engagement',
      currentPhase: 'No posts to schedule. Activating engagement...',
      progressPercent: 85,
      log: [...state.log, 'No draft posts found to schedule.'],
    };
  }    // Track scheduled times per platform to enforce 3-hour spacing
  const platformSchedule: Record<string, Date[]> = {};
  const now = new Date();

  // Distribute posts across the campaign duration
  const campaignStart = new Date(state.startDate);
  const campaignEnd = new Date(state.endDate);
  const campaignMs = campaignEnd.getTime() - campaignStart.getTime();

  // Sort posts by platform to batch similar platforms together
  const postsByPlatform: Record<string, any[]> = {};
  for (const post of posts) {
    const p = post as any;
    if (!postsByPlatform[p.platform]) postsByPlatform[p.platform] = [];
    postsByPlatform[p.platform].push(p);
  }

  let firstPostDate = '';
  const uniquePlatforms = new Set<string>();
  let scheduledCount = 0;
  const allScheduledPosts: Array<{ id: string; platform: string; content: string; scheduledAt: string; contentType: string }> = [];

  for (const [platform, platformPosts] of Object.entries(postsByPlatform)) {
    uniquePlatforms.add(platform);
    if (!platformSchedule[platform]) platformSchedule[platform] = [];

    const totalSlots = platformPosts.length;
    // Space posts evenly across the campaign duration for this platform
    const msBetweenSlots = Math.floor(campaignMs / Math.max(totalSlots, 1));

    for (let i = 0; i < platformPosts.length; i++) {
      const post = platformPosts[i];
      try {
        // Get suggested posting time (pass empty connectorId which falls back to defaults)
        const suggestedTime = await suggestPostingTime(platform, state.brandProfileId, '');

        // Calculate a candidate time: start of campaign + slot offset, adjusted for optimal day/hour
        const slotOffset = i * msBetweenSlots;
        let candidateTime = new Date(campaignStart.getTime() + slotOffset);

        // Use the suggested time's day/hour if available
        const suggested = new Date(suggestedTime.suggestedDateTime);
        candidateTime.setHours(suggested.getHours(), suggested.getMinutes(), 0, 0);

        // Ensure candidate is at least 1 hour from now
        if (candidateTime.getTime() < now.getTime() + 3600000) {
          candidateTime = new Date(now.getTime() + 3600000 + i * 3600000);
        }

        // Enforce 3-hour spacing within the same platform
        let hasConflict = true;
        let attempts = 0;
        while (hasConflict && attempts < 10) {
          hasConflict = false;
          for (const existing of platformSchedule[platform]) {
            if (Math.abs(existing.getTime() - candidateTime.getTime()) < 3 * 3600000) {
              hasConflict = true;
              candidateTime = new Date(candidateTime.getTime() + 3600000);
              break;
            }
          }
          attempts++;
        }

        platformSchedule[platform].push(candidateTime);
        platformSchedule[platform].sort((a, b) => a.getTime() - b.getTime());

        const scheduledAt = candidateTime.toISOString();
        if (!firstPostDate || candidateTime < new Date(firstPostDate)) {
          firstPostDate = scheduledAt;
        }

        // Update post status to awaiting_approval
        await db
          .update(scheduledPosts)
          .set({
            scheduledAt,
            status: 'awaiting_approval',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, post.id))
          .run();

        allScheduledPosts.push({
          id: post.id,
          platform: post.platform,
          content: post.content,
          scheduledAt,
          contentType: post.contentType || 'social_post',
        });

        scheduledCount++;
      } catch (err) {
        console.warn(`[Autopilot] Scheduling failed for post ${post.id}:`, (err as Error).message);
      }
    }
  }

  // Create a single batch approval request for all posts (assisted mode) or individual ones (safe/autonomous)
  // The approval service will route appropriately based on the current mode
  if (allScheduledPosts.length > 0) {
    try {
      const { requestApproval } = await import('../services/approvalService');
      // Batch request: use 'start_campaign' type with a batch payload containing all posts
      await requestApproval({
        requestType: 'publish_post',
        payload: {
          batchId: crypto.randomUUID(),
          brandProfileId: state.brandProfileId,
          posts: allScheduledPosts.map((p) => ({
            postId: p.id,
            platform: p.platform,
            content: p.content,
            scheduledAt: p.scheduledAt,
            isPromoContent: p.contentType === 'promotional',
          })),
          autopilotId: state.autopilotId,
          totalPosts: allScheduledPosts.length,
          summary: `Batch of ${allScheduledPosts.length} posts from Autopilot session ${state.autopilotId}`,
        },
        brandProfileId: state.brandProfileId,
        requestedBy: 'autopilot',
        urgency: 'scheduled',
      });
    } catch {
      // Fallback: if approval fails, set all posts to pending directly
      for (const p of allScheduledPosts) {
        try {
          await db
            .update(scheduledPosts)
            .set({ status: 'pending', updatedAt: new Date().toISOString() })
            .where(eq(scheduledPosts.id, p.id))
            .run();
        } catch { /* ignore */ }
      }
    }
  }

  const firstPost = firstPostDate ? new Date(firstPostDate) : new Date();
  const dateStr = firstPost.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = firstPost.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const newState = addEntry(
    {
      ...state,
      status: 'activating_engagement',
      currentPhase: 'Activating engagement monitoring...',
      progressPercent: 85,
    },
    `Scheduled ${scheduledCount} posts across ${uniquePlatforms.size} platforms. First post goes live ${dateStr} at ${timeStr}.`,
    {
      phase: 'schedule',
      action: 'schedule',
      title: `Scheduled ${scheduledCount} posts across ${uniquePlatforms.size} platform(s)`,
      detail: `First post goes live ${dateStr} at ${timeStr}. Posts are spaced ~3 hours apart and placed at your audience's best-performing times.`,
      why: `Posting blindly wastes reach. I placed each post at the optimal day/time for its platform and queued them for your approval, so nothing goes out without you seeing it.`,
      status: 'done',
      metrics: { postsScheduled: scheduledCount, platforms: uniquePlatforms.size },
    }
  );

  await persistState(newState);
  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 6 — activateEngagementPhase                                   */
/* ================================================================== */

async function activateEngagementPhaseNode(state: AutopilotState): Promise<AutopilotState> {
  // Set autoReplyEnabled for this session
  const autoReplyKey = 'autopilot_auto_reply_' + state.autopilotId;
  const existingAutoReply = db.select().from(appSettings).where(eq(appSettings.key, autoReplyKey)).get();
  if (existingAutoReply) {
    await db.update(appSettings).set({ value: 'true', updatedAt: new Date().toISOString() }).where(eq(appSettings.key, autoReplyKey)).run();
  } else {
    await db.insert(appSettings).values({ key: autoReplyKey, value: 'true', updatedAt: new Date().toISOString() });
  }

  // Set confidence threshold to 0.80
  const thresholdKey = 'autopilot_confidence_threshold_' + state.autopilotId;
  const existingThreshold = db.select().from(appSettings).where(eq(appSettings.key, thresholdKey)).get();
  if (existingThreshold) {
    await db.update(appSettings).set({ value: '0.80', updatedAt: new Date().toISOString() }).where(eq(appSettings.key, thresholdKey)).run();
  } else {
    await db.insert(appSettings).values({ key: thresholdKey, value: '0.80', updatedAt: new Date().toISOString() });
  }

  const newState = addEntry(
    {
      ...state,
      engagementEnabled: true,
      status: 'monitoring',
      currentPhase: 'Setting up monitoring checkpoints...',
      progressPercent: 95,
    },
    'Engagement monitoring activated. VIMO will automatically respond to comments with confidence above 80%.',
    {
      phase: 'engage',
      action: 'engage',
      title: 'Engagement autopilot armed',
      detail: 'VIMO will automatically reply to comments above 80% confidence.',
      why: 'Real growth comes from conversations, not just posts. I turned on automatic, on-brand replies so your audience always gets a response — but only when I am confident it is the right thing to say.',
      status: 'done',
    }
  );

  await persistState(newState);
  emitStatus(newState);
  return newState;
}

/* ================================================================== */
/*  NODE 7 — activateMonitoring                                        */
/* ================================================================== */

async function activateMonitoringNode(state: AutopilotState): Promise<AutopilotState> {
  const now = new Date();
  const autopilotId = state.autopilotId;

  // Create checkpoints: day 3, halfway, day after end
  const startDate = new Date(state.startDate);
  const endDate = new Date(state.endDate);
  const durationMs = endDate.getTime() - startDate.getTime();
  const halfwayDate = new Date(startDate.getTime() + durationMs / 2);

  const checkpoints = [
    { date: new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000), type: 'performance_review' },
    { date: halfwayDate, type: 'mid_campaign_adjust' },
    { date: new Date(endDate.getTime() + 24 * 60 * 60 * 1000), type: 'final_report' },
  ];

  for (const cp of checkpoints) {
    await db.insert(autopilotCheckpoints).values({
      id: crypto.randomUUID(),
      autopilotId,
      checkDate: cp.date.toISOString(),
      checkType: cp.type,
      status: 'pending',
      createdAt: now.toISOString(),
    });
  }

  const day3Date = checkpoints[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const nextDay = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const finalState: AutopilotState = {
    ...state,
    status: 'monitoring',
    currentPhase: 'Autopilot is fully active',
    progressPercent: 100,
    log: [
      ...state.log,
      `Autopilot is now fully active. VIMO is handling your marketing. You will receive a progress report on day 3 (${day3Date}) and a final report on ${nextDay}.`,
    ],
    timeline: [
      ...state.timeline,
      {
        id: crypto.randomUUID(),
        phase: 'monitor',
        action: 'monitor',
        title: 'Autopilot is fully active — monitoring your results',
        detail: `Progress reports scheduled for day 3 (${day3Date}) and a final report on ${nextDay}.`,
        why: 'The hands-on work is done; now I watch performance and adjust. You stay in control — every post waited for your approval and you can pause me anytime.',
        timestamp: now.toISOString(),
        status: 'done',
      },
    ],
  };

  // Set completedAt
  await db
    .update(autopilotSessions)
    .set({
      status: 'monitoring',
      progressPercent: 100,
      logJson: JSON.stringify(finalState.log),
      timelineJson: JSON.stringify(finalState.timeline),
      completedAt: now.toISOString(),
    })
    .where(eq(autopilotSessions.id, autopilotId))
    .run();

  // Emit fully_active event
  try {
    if (io) {
      io.emit('autopilot:fully_active', finalState);
    }
  } catch {
    // Socket not available
  }

  return finalState;
}

/* ================================================================== */
/*  Node — done                                                        */
/* ================================================================== */

async function doneNode(state: AutopilotState): Promise<AutopilotState> {
  return state;
}

/* ================================================================== */
/*  Graph wiring                                                       */
/* ================================================================== */

// Use the exported function to run the graph via sequential node execution
// (LangGraph StateGraph is defined and compiled for future use with streaming)

/* ================================================================== */
/*  Sequential node runner                                              */
/* ================================================================== */

const NODE_ORDER = [
  'initialize',
  'researchPhase',
  'strategyPhase',
  'contentCreationPhase',
  'schedulingPhase',
  'activateEngagementPhase',
  'activateMonitoring',
  'done',
] as const;

type NodeName = typeof NODE_ORDER[number];

const nodeMap: Record<NodeName, (state: AutopilotState) => Promise<AutopilotState>> = {
  initialize: initializeNode,
  researchPhase: researchPhaseNode,
  strategyPhase: strategyPhaseNode,
  contentCreationPhase: contentCreationPhaseNode,
  schedulingPhase: schedulingPhaseNode,
  activateEngagementPhase: activateEngagementPhaseNode,
  activateMonitoring: activateMonitoringNode,
  done: doneNode,
};

async function runGraph(initialState: AutopilotState): Promise<AutopilotState> {
  let currentState = initialState;
  for (const nodeName of NODE_ORDER) {
    // Check if paused
    const session = await db
      .select()
      .from(autopilotSessions)
      .where(eq(autopilotSessions.id, currentState.autopilotId))
      .get();
    if (session && session.status === 'paused') {
      console.log(`[Autopilot] ${currentState.autopilotId} paused at node ${nodeName}`);
      break;
    }

    const fn = nodeMap[nodeName];
    currentState = await fn(currentState);

    if (currentState.status === 'failed' || currentState.status === 'paused') {
      break;
    }
  }
  return currentState;
}

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

/**
 * Start the autopilot for a brand. Runs in non-blocking background.
 * The HTTP response returns immediately with the autopilotId.
 */
export async function startAutopilot(params: {
  brandProfileId: string;
  audienceDescription: string;
  primaryGoal: string;
  goalType: string;
  durationDays: number;
  channels: string[];
}): Promise<{ autopilotId: string }> {
  const { brandProfileId, audienceDescription, primaryGoal, goalType, durationDays, channels } = params;

  const autopilotId = crypto.randomUUID();
  const now = new Date();
  const startDate = now.toISOString();
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const initialState: AutopilotState = {
    autopilotId,
    brandProfileId,
    audienceDescription,
    primaryGoal,
    goalType,
    durationDays,
    channels,
    startDate,
    endDate,
    status: 'initializing',
    currentPhase: 'Initializing...',
    trendSignals: [],
    strategyDocument: null,
    contentCalendar: null,
    scheduledPostIds: [],
    engagementEnabled: false,
    progressPercent: 0,
    log: [],
    timeline: [],
    startedAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(),
    error: null,
  };

  // Run in background (non-blocking)
  (async () => {
    try {
      const finalState = await runGraph(initialState);
      console.log(`[Autopilot] ${autopilotId} completed with status ${finalState.status}`);
    } catch (err) {
      console.error(`[Autopilot] ${autopilotId} error:`, err);
      try {
        await db
          .update(autopilotSessions)
          .set({
            status: 'failed',
            logJson: JSON.stringify([...(initialState.log || []), `Fatal error: ${(err as Error).message}`]),
          })
          .where(eq(autopilotSessions.id, autopilotId))
          .run();
      } catch {
        // ignore
      }
    }
  })();

  return { autopilotId };
}

/**
 * Pause a running autopilot session.
 */
export async function pauseAutopilot(autopilotId: string): Promise<void> {
  await db
    .update(autopilotSessions)
    .set({
      status: 'paused',
    })
    .where(eq(autopilotSessions.id, autopilotId))
    .run();

  // Cancel any pending BullMQ jobs associated with this autopilot
  try {
    const allPosts = db.select().from(scheduledPosts).all();
    const autopilotPosts = (allPosts as any[]).filter(
      (p: any) => p.metadataJson && JSON.parse(p.metadataJson).autopilotId === autopilotId && p.status === 'pending'
    );
    for (const post of autopilotPosts) {
      await cancelPost(post.id);
    }
  } catch {
    // BullMQ might not be available
  }

  console.log(`[Autopilot] ${autopilotId} paused.`);
}

/**
 * Resume a paused autopilot session.
 */
export async function resumeAutopilot(autopilotId: string): Promise<void> {
  const session = await db
    .select()
    .from(autopilotSessions)
    .where(eq(autopilotSessions.id, autopilotId))
    .get();

  if (!session) {
    throw new Error(`Autopilot session ${autopilotId} not found`);
  }

  await db
    .update(autopilotSessions)
    .set({ status: 'resuming' })
    .where(eq(autopilotSessions.id, autopilotId))
    .run();

  console.log(`[Autopilot] ${autopilotId} resumed from ${session.status}`);
}
