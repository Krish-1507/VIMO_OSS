import { StateGraph, END, START } from '@langchain/langgraph';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, agentLogs, appSettings } from '../db/schema';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { TaskType, getModelForTask, recordLLMUsage, estimateTokenCount, calculateCost } from '../lib/modelRouter';
import { getBrandContext } from '../services/brandMemoryService';
import { generatePost } from '../services/contentGenerationService';
import { schedulePost } from '../services/schedulerService';
import { applyAdaptivePlan } from '../lib/adaptivePlanning';
import { io } from '../index';
import { sanitizeUserInput } from '../lib/promptSanitizer';
import { PHASE_DESCRIPTIONS } from './goalTranslationAgent';

/* ------------------------------------------------------------------ */
/*  CampaignAgentState                                                 */
/* ------------------------------------------------------------------ */
interface CampaignAgentState {
  campaignId: string;
  goal: string;
  brandProfileId: string;
  channels: string[];
  startDate: string;
  endDate: string;
  durationDays: number;
  brandContext: string;
  strategy: string | null;
  funnelPlan: Record<number, string> | null;
  goalType: string | null;
  refinedGoal: string | null;
  contentCalendar: Array<{
    date: string;
    platform: string;
    contentBrief: string;
    postType: string;
    funnelPhase?: string;
    weekNumber?: number;
    contentGoal?: string;
  }> | null;
  generatedPosts: Array<{
    calendarEntryId: string;
    platform: string;
    content: string;
    hashtags: string[];
    scheduledAt: string;
  }> | null;
  requiresHumanApproval: boolean;
  humanApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
  errors: string[];
  completedAt: string | null;
  strategyObj?: StrategyResult; // typed parsed strategy
}

interface StrategyResult {
  strategyTitle: string;
  objective: string;
  targetAudience: string;
  keyMessages: string[];
  contentPillars: string[];
  postingFrequency: Record<string, number>;
  kpis: string[];
  hashtagStrategy: string;
  explanation?: import('../lib/explainer').Explanation;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function isAgentsPaused(): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'agentsPaused')).get();
  return row?.value === 'true';
}

function calculateDuration(start: string, end: string): number {
  return Math.ceil(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  );
}

async function logAgentAction(params: {
  agentType: string;
  action: string;
  input: string;
  output: string;
  status: string;
  durationMs: number;
}) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    agentType: params.agentType,
    action: params.action,
    input: params.input,
    output: params.output,
    connectorsCalled: '',
    status: params.status,
    durationMs: params.durationMs,
    createdAt: new Date().toISOString(),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function emitAgentAction(params: {
  step: string;
  status: string;
  summary?: string;
  campaignId: string;
}) {
  io.emit('agent:action', {
    agentType: 'campaign',
    step: params.step,
    status: params.status,
    summary: params.summary || `Step ${params.step} — ${params.status}`,
    campaignId: params.campaignId,
    timestamp: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/*  Node 1 — planStrategy                                              */
/* ------------------------------------------------------------------ */

async function planStrategy(state: CampaignAgentState): Promise<CampaignAgentState> {
  const start = Date.now();
  try {
    const sanitizedGoal = sanitizeUserInput(state.goal);
    const brandContext = await getBrandContext(state.brandProfileId, sanitizedGoal);

    const days = calculateDuration(state.startDate, state.endDate);
    const prompt = `You are a senior marketing strategist. Create a detailed campaign strategy.
Goal: ${sanitizedGoal}
Brand: ${brandContext}
Channels: ${state.channels.join(', ')}
Duration: ${days} days
Return ONLY valid JSON with:
  strategyTitle (string),
  objective (string),
  targetAudience (string),
  keyMessages (array of 3-5 strings),
  contentPillars (array of 3-4 strings — the themes/topics to cover),
  postingFrequency (object mapping each channel to posts per week),
  kpis (array of specific measurable goals),
  hashtagyStrategy (string)`;

    const modelRoute = await getModelForTask(TaskType.STRATEGY);

    const resultText = await callWithProviderChain(
      'campaign strategy',
      async (provider, modelId) => {
        const result = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        // Record usage
        const inputTokens = estimateTokenCount(prompt);
        const outputTokens = estimateTokenCount(result.text);
        const cost = calculateCost(modelRoute.modelId, inputTokens, outputTokens);
        recordLLMUsage({
          taskType: TaskType.STRATEGY,
          provider: modelRoute.provider,
          modelId: modelRoute.modelId,
          inputTokens,
          outputTokens,
          costUSD: cost,
          brandProfileId: state.brandProfileId,
          relatedEntityType: 'campaign_strategy',
          relatedEntityId: state.campaignId,
        });
        return result.text;
      },
      () => {
        return JSON.stringify({
          strategyTitle: 'Campaign Strategy',
          objective: state.goal,
          targetAudience: 'General audience',
          keyMessages: [state.goal],
          contentPillars: ['Educational', 'Promotional', 'Engagement'],
          postingFrequency: Object.fromEntries(state.channels.map((c) => [c, 3])),
          kpis: ['Increase engagement', 'Grow followers'],
          hashtagStrategy: 'Use branded hashtags with niche-specific tags',
        });
      },
      modelRoute
    );

    const parsed = JSON.parse(resultText.trim()) as StrategyResult;
    const strategyTitle = parsed.strategyTitle || 'Campaign Strategy';

    await logAgentAction({
      agentType: 'campaign',
      action: 'planStrategy',
      input: state.goal,
      output: resultText.trim().slice(0, 2000),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'planStrategy',
      status: 'complete',
      summary: `Generated campaign strategy: ${strategyTitle}`,
    });

    // Generate explanation for campaign strategy
    let strategyExplanation: import('../lib/explainer').Explanation | undefined;
    try {
      const { explainCampaignStrategy } = await import('../lib/explainer');
      strategyExplanation = await explainCampaignStrategy({
        brandProfileId: state.brandProfileId,
        strategy: parsed as unknown as Record<string, unknown>,
        goalType: state.goalType || state.goal,
        brandMemory: brandContext,
      });
    } catch { /* optional */ }

    return {
      ...state,
      strategy: JSON.stringify(parsed),
      strategyObj: { ...parsed, explanation: strategyExplanation },
      brandContext,
      durationDays: days,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...state, errors: [...state.errors, `planStrategy: ${msg}`] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 2 — buildCalendar                                             */
/* ------------------------------------------------------------------ */

async function buildCalendar(state: CampaignAgentState): Promise<CampaignAgentState> {
  const start = Date.now();
  try {
    if (!state.strategy) throw new Error('No strategy found');

    const strategy = typeof state.strategy === 'string'
      ? (JSON.parse(state.strategy) as StrategyResult)
      : state.strategy;
    const days = calculateDuration(state.startDate, state.endDate);
    const durationWeeks = Math.max(1, Math.ceil(days / 7));

    // Adaptive plan: bias the postType mix in the calendar based on real
    // performance data. A rule with weight 2.0 for founder_story should
    // produce roughly 2x the founder_story slots.
    let adaptivePostTypeGuidance = '';
    try {
      const adjustments = await applyAdaptivePlan(state.brandProfileId, {
        platform: state.channels[0],
        topic: state.goal,
      });
      const weights = adjustments.contentTypeWeights || {};
      const avoided = adjustments.avoidedContentTypes || [];
      if (Object.keys(weights).length > 0 || avoided.length > 0) {
        const weightLines = Object.entries(weights)
          .map(([ct, w]) => `- ${ct}: weight ${w}x (boost this type)`)
          .join('\n');
        const avoidLines = avoided.map((ct) => `- ${ct}: AVOID (do not use this postType)`).join('\n');
        adaptivePostTypeGuidance = `\n\nADAPTIVE PLAN ADJUSTMENTS (from this brand's performance data):\n${weightLines}${avoidLines ? '\n' + avoidLines : ''}\nIncorporate these weights into the content calendar — the weighted post types should appear in the calendar with roughly that relative frequency.`;
      }
    } catch (err) {
      console.warn('[CampaignAgent] applyAdaptivePlan failed:', (err as Error).message);
    }

    // Build funnel plan section of prompt
    let funnelContext = '';
    if (state.funnelPlan) {
      const funnelEntries = Object.entries(state.funnelPlan)
        .map(([week, phase]) => {
          const weekNum = parseInt(week, 10);
          const phaseDesc = PHASE_DESCRIPTIONS[phase] || `Focus on ${phase} content.`;
          return `Week ${weekNum} (${phase} phase): Content should ${phaseDesc}`;
        })
        .join('\n');

      funnelContext = `\n\nThe campaign has ${durationWeeks} weeks. The funnel plan is:
${JSON.stringify(state.funnelPlan)}\n\nFunnel phase details:\n${funnelEntries}\n\nIMPORTANT: Each week's content MUST follow the funnel phase assigned above. The funnel is designed to guide the audience from awareness through to conversion.`;
    }

    const prompt = `You are a content calendar expert. Based on this strategy, create a detailed content calendar.
Strategy Title: ${strategy.strategyTitle}
Objective: ${strategy.objective}
Channels: ${state.channels.join(', ')}
Duration: ${state.startDate} to ${state.endDate} (${days} days)
Posting frequency: ${JSON.stringify(strategy.postingFrequency)}
Content Pillars: ${strategy.contentPillars?.join(', ') || 'General'}
Key Messages: ${strategy.keyMessages?.join(', ') || ''}${funnelContext}${adaptivePostTypeGuidance}
Return ONLY valid JSON: an array of calendar entries. Each entry: { date: 'YYYY-MM-DD', platform: string, timeOfDay: 'morning'|'afternoon'|'evening', contentBrief: string (1-2 sentences describing exactly what this post should say), postType: 'educational'|'promotional'|'engagement'|'storytelling'|'social_proof', contentPillar: string, funnelPhase: string (the funnel phase for this week, e.g. 'awareness', 'education', 'social_proof', 'conversion'), weekNumber: number (which week 1-4 this belongs to), contentGoal: string (what this specific post should achieve)`;

    const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);

    const calText = await callWithProviderChain(
      'campaign calendar',
      async (provider, modelId) => {
        const result = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return result.text;
      },
      () => {
        // Return a minimal calendar with one post per channel
        return JSON.stringify(state.channels.map((ch, i) => ({
          date: new Date(Date.now() + (i + 1) * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          platform: ch,
          timeOfDay: 'morning',
          contentBrief: `Share a ${strategy.contentPillars?.[0] || 'general'} post about ${strategy.keyMessages?.[0] || state.goal}`,
          postType: 'educational',
          contentPillar: strategy.contentPillars?.[0] || 'General',
          funnelPhase: 'awareness',
          weekNumber: 1,
          contentGoal: 'Build awareness',
        })));
      },
      modelRoute
    );

    // Record usage for calendar generation
    await recordLLMUsage({
      taskType: TaskType.CONTENT_GENERATION,
      provider: modelRoute.provider,
      modelId: modelRoute.modelId,
      inputTokens: estimateTokenCount(prompt),
      outputTokens: estimateTokenCount(calText),
      costUSD: calculateCost(modelRoute.modelId, estimateTokenCount(prompt), estimateTokenCount(calText)),
      brandProfileId: state.brandProfileId,
      relatedEntityType: 'campaign_calendar',
      relatedEntityId: state.campaignId,
    });

    const entries = JSON.parse(calText.trim()) as Array<{
      date: string;
      platform: string;
      timeOfDay: string;
      contentBrief: string;
      postType: string;
      contentPillar: string;
      funnelPhase?: string;
      weekNumber?: number;
      contentGoal?: string;
    }>;

    // Fetch the adaptive adjustments again for post-LLM rebalancing
    let adaptiveContentTypeWeights: Record<string, number> = {};
    let adaptiveAvoidedTypes: string[] = [];
    try {
      const adjustments = await applyAdaptivePlan(state.brandProfileId, {
        platform: state.channels[0],
        topic: state.goal,
      });
      adaptiveContentTypeWeights = adjustments.contentTypeWeights || {};
      adaptiveAvoidedTypes = adjustments.avoidedContentTypes || [];
    } catch { /* no-op */ }

    // Remove any entries whose postType is in the avoid list
    let filteredEntries = entries.filter(
      (e) => !adaptiveAvoidedTypes.includes(e.postType)
    );
    if (filteredEntries.length === 0) {
      filteredEntries = entries; // don't end up with an empty calendar
    }

    // If we have weights, rebalance the postType distribution
    const weightKeys = Object.keys(adaptiveContentTypeWeights);
    if (weightKeys.length > 0 && filteredEntries.length > 0) {
      const total = filteredEntries.length;
      // Count current occurrences per postType
      const counts: Record<string, number> = {};
      for (const e of filteredEntries) {
        counts[e.postType] = (counts[e.postType] || 0) + 1;
      }
      // Compute desired counts based on weights (e.g. 2.0 -> 2x normal)
      const totalWeight = Object.values(adaptiveContentTypeWeights).reduce(
        (a: number, b: number) => a + b,
        0
      );
      const desired: Record<string, number> = {};
      for (const [ct, w] of Object.entries(adaptiveContentTypeWeights)) {
        desired[ct] = Math.max(1, Math.round((w / totalWeight) * total));
      }
      // Find entries of the boosted type that we want to KEEP, and entries
      // of other types that we want to convert.
      const rebalanced = filteredEntries.map((e) => ({ ...e }));
      // If an entry's postType is in the desired list, leave it.
      // Otherwise, see if we need MORE of a desired type and convert this entry.
      const remainingNeeds: Record<string, number> = {};
      for (const [ct, dCount] of Object.entries(desired)) {
        remainingNeeds[ct] = Math.max(0, dCount - (counts[ct] || 0));
      }
      for (const entry of rebalanced) {
        if (desired[entry.postType]) continue;
        // Find a desired type that still needs more slots
        const neededType = weightKeys.find((k) => remainingNeeds[k] > 0);
        if (neededType) {
          entry.postType = neededType;
          remainingNeeds[neededType] -= 1;
        }
      }
      filteredEntries = rebalanced;
    }

    const contentCalendar = filteredEntries.map((e) => ({
      date: e.date,
      platform: e.platform,
      contentBrief: e.contentBrief,
      postType: e.postType,
      funnelPhase: e.funnelPhase,
      weekNumber: e.weekNumber,
      contentGoal: e.contentGoal,
    }));

    await logAgentAction({
      agentType: 'campaign',
      action: 'buildCalendar',
      input: strategy.strategyTitle,
      output: `Built calendar with ${entries.length} entries`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'buildCalendar',
      status: 'complete',
      summary: `Built content calendar with ${entries.length} entries`,
    });

    return { ...state, contentCalendar };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...state, errors: [...state.errors, `buildCalendar: ${msg}`] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 3 — generateContent                                           */
/* ------------------------------------------------------------------ */

async function generateContent(state: CampaignAgentState): Promise<CampaignAgentState> {
  const start = Date.now();
  try {
    if (!state.contentCalendar || state.contentCalendar.length === 0) {
      return { ...state, errors: [...state.errors, 'generateContent: no calendar entries'] };
    }

    const generatedPosts: NonNullable<CampaignAgentState['generatedPosts']> = [];
    const calendar = state.contentCalendar;
    const batchSize = 5;

    for (let i = 0; i < calendar.length; i += batchSize) {
      const batch = calendar.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          try {
            const result = await generatePost({
              brandProfileId: state.brandProfileId,
              platform: entry.platform,
              topic: entry.contentBrief,
              additionalContext: `Post type: ${entry.postType}. This is part of a multi-post campaign.`,
              tone: 'primary brand voice',
            });
            return {
              calendarEntryId: entry.date + entry.platform,
              platform: entry.platform,
              content: result.content,
              hashtags: result.hashtags,
              scheduledAt: `${entry.date}T09:00:00.000Z`, // default to 9am UTC, can be refined later
            };
          } catch {
            return null;
          }
        })
      );

      batchResults.forEach((res) => {
        if (res) generatedPosts.push(res);
      });

      await emitAgentAction({
        campaignId: state.campaignId,
        step: 'generateContent',
        status: 'in-progress',
        summary: `Generated ${Math.min(i + batchSize, calendar.length)}/${calendar.length} posts...`,
      });

      await sleep(500); // Rate limiter
    }

    await logAgentAction({
      agentType: 'campaign',
      action: 'generateContent',
      input: `${calendar.length} calendar entries`,
      output: `Generated ${generatedPosts.length} posts`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'generateContent',
      status: 'complete',
      summary: `Generated ${generatedPosts.length} posts`,
    });

    return { ...state, generatedPosts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...state, errors: [...state.errors, `generateContent: ${msg}`] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 4 — reviewGate                                                */
/* ------------------------------------------------------------------ */

async function reviewGate(state: CampaignAgentState): Promise<CampaignAgentState> {
  if (state.requiresHumanApproval) {
    await db
      .update(campaigns)
      .set({ status: 'awaiting_approval', updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, state.campaignId))
      .run();

    io.emit('campaign:awaiting_approval', {
      campaignId: state.campaignId,
      status: 'awaiting_approval',
      generatedPosts: state.generatedPosts,
      contentCalendar: state.contentCalendar,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'reviewGate',
      status: 'waiting',
      summary: 'Campaign awaiting human approval',
    });
  }
  return state;
}

/* ------------------------------------------------------------------ */
/*  Node 5 — schedulePosts                                             */
/* ------------------------------------------------------------------ */

async function schedulePosts(state: CampaignAgentState): Promise<CampaignAgentState> {
  const start = Date.now();
  try {
    if (!state.generatedPosts || state.generatedPosts.length === 0) {
      return { ...state, errors: [...state.errors, 'schedulePosts: no posts to schedule'] };
    }

    const batchSize = 5;
    for (let i = 0; i < state.generatedPosts.length; i += batchSize) {
      const batch = state.generatedPosts.slice(i, i + batchSize);
      await Promise.all(
        batch.map((post) =>
          schedulePost({
            campaignId: state.campaignId,
            brandProfileId: state.brandProfileId,
            content: post.content,
            platform: post.platform,
            scheduledAt: post.scheduledAt,
            metadata: { hashtags: post.hashtags, campaignId: state.campaignId },
          })
        )
      );

      await emitAgentAction({
        campaignId: state.campaignId,
        step: 'schedulePosts',
        status: 'in-progress',
        summary: `Scheduled ${Math.min(i + batchSize, state.generatedPosts.length)}/${state.generatedPosts.length} posts...`,
      });

      await sleep(200);
    }

    await logAgentAction({
      agentType: 'campaign',
      action: 'schedulePosts',
      input: `${state.generatedPosts.length} posts`,
      output: 'All posts scheduled',
      status: 'complete',
      durationMs: Date.now() - start,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'schedulePosts',
      status: 'complete',
      summary: `Scheduled ${state.generatedPosts.length} posts`,
    });

    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...state, errors: [...state.errors, `schedulePosts: ${msg}`] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 6 — monitorSetup                                              */
/* ------------------------------------------------------------------ */

async function monitorSetup(state: CampaignAgentState): Promise<CampaignAgentState> {
  const start = Date.now();
  try {
    const s = new Date(state.startDate);
    const e = new Date(state.endDate);

    const checkDates = [
      new Date(s.getTime() + 3 * 24 * 60 * 60 * 1000),
      new Date(s.getTime() + 7 * 24 * 60 * 60 * 1000),
      new Date(e.getTime() + 1 * 24 * 60 * 60 * 1000),
    ]
      .filter((d) => d > new Date())
      .map((d) => d.toISOString().slice(0, 10));

    await logAgentAction({
      agentType: 'campaign',
      action: 'monitorSetup',
      input: state.campaignId,
      output: `Monitoring dates: ${checkDates.join(', ')}`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    await emitAgentAction({
      campaignId: state.campaignId,
      step: 'monitorSetup',
      status: 'complete',
      summary: 'Campaign monitoring activated.',
    });

    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...state, errors: [...state.errors, `monitorSetup: ${msg}`] };
  }
}

/* ------------------------------------------------------------------ */
/*  Node 7 — done                                                      */
/* ------------------------------------------------------------------ */

async function done(state: CampaignAgentState): Promise<CampaignAgentState> {
  const now = new Date().toISOString();
  await db
    .update(campaigns)
    .set({ status: 'active', updatedAt: now })
    .where(eq(campaigns.id, state.campaignId))
    .run();

  io.emit('agent:complete', {
    campaignId: state.campaignId,
    status: 'active',
    completedAt: now,
    summary: `Campaign "${state.campaignId}" completed successfully. ${state.generatedPosts?.length || 0} posts scheduled.`,
  });

  // Send campaign complete notification
  try {
    const { notifyCampaignComplete } = await import('../services/notificationService');
    const campaignRow = await db.select().from(campaigns).where(eq(campaigns.id, state.campaignId)).get();
    if (campaignRow) {
      await notifyCampaignComplete(campaignRow.name);
    }
  } catch { /* notification may not be available */ }

  // Record campaign completion in brand memory
  try {
    const { recordCampaignCompletion } = await import('../services/brandMemoryService');
    await recordCampaignCompletion(state.brandProfileId, state.campaignId);
  } catch (memErr) {
    console.warn('[CampaignAgent] Failed to record campaign completion:', (memErr as Error).message);
  }

  return { ...state, completedAt: now };
}

/* ------------------------------------------------------------------ */
/*  Graph wiring                                                       */
/* ------------------------------------------------------------------ */

interface WorkflowSnapshot {
  state: CampaignAgentState;
  waitingForApproval?: boolean;
}

const stateGraph = new StateGraph<CampaignAgentState, any, any, any, any>({
  channels: {} as any,
});

stateGraph.addNode('planStrategy', planStrategy);
stateGraph.addNode('buildCalendar', buildCalendar);
stateGraph.addNode('generateContent', generateContent);
stateGraph.addNode('reviewGate', reviewGate);
stateGraph.addNode('schedulePosts', schedulePosts);
stateGraph.addNode('monitorSetup', monitorSetup);
stateGraph.addNode('done', done);

stateGraph.addEdge(START, 'planStrategy');
stateGraph.addEdge('planStrategy', 'buildCalendar');
stateGraph.addEdge('buildCalendar', 'generateContent');
stateGraph.addEdge('generateContent', 'reviewGate');
stateGraph.addConditionalEdges('reviewGate', async (state: CampaignAgentState) => {
  if (state.requiresHumanApproval && state.humanApprovalStatus === null) {
    return END;
  }
  return 'schedulePosts';
});
stateGraph.addEdge('schedulePosts', 'monitorSetup');
stateGraph.addEdge('monitorSetup', 'done');
stateGraph.addEdge('done', END);

const graph = stateGraph.compile();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

const pausedWorkflows = new Map<string, WorkflowSnapshot>();

export async function runCampaignAgent(params: {
  campaignId: string;
  goal: string;
  brandProfileId: string;
  channels: string[];
  startDate: string;
  endDate: string;
  requiresHumanApproval: boolean;
  funnelPlan?: Record<number, string> | null;
  goalType?: string | null;
  refinedGoal?: string | null;
}): Promise<void> {
  if (await isAgentsPaused()) {
    console.log('[CampaignAgent] Paused. Skipping run.');
    return;
  }
  const brandContext = await getBrandContext(params.brandProfileId, params.goal);
  const durationDays = calculateDuration(params.startDate, params.endDate);

  const initialState: CampaignAgentState = {
    campaignId: params.campaignId,
    goal: params.goal,
    brandProfileId: params.brandProfileId,
    channels: params.channels,
    startDate: params.startDate,
    endDate: params.endDate,
    durationDays,
    brandContext,
    strategy: null,
    funnelPlan: params.funnelPlan || null,
    goalType: params.goalType || null,
    refinedGoal: params.refinedGoal || null,
    contentCalendar: null,
    generatedPosts: null,
    requiresHumanApproval: params.requiresHumanApproval,
    humanApprovalStatus: null,
    errors: [],
    completedAt: null,
  };

  try {
    await db
      .update(campaigns)
      .set({ status: 'running', updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, params.campaignId))
      .run();

    await graph.stream(initialState, { recursionLimit: 100, configurable: { thread_id: params.campaignId } });

    // After stream finishes, check if workflow paused at review
    const finalState = pausedWorkflows.get(params.campaignId);
    if (params.requiresHumanApproval && !finalState?.waitingForApproval) {
      pausedWorkflows.set(params.campaignId, { state: initialState, waitingForApproval: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(campaigns)
      .set({ status: 'error', updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, params.campaignId))
      .run();

    await logAgentAction({
      agentType: 'campaign',
      action: 'runCampaignAgent',
      input: params.campaignId,
      output: msg,
      status: 'error',
      durationMs: 0,
    });
    throw err;
  }
}

export async function resumeCampaignAgent(campaignId: string, approved: boolean): Promise<void> {
  const snapshot = pausedWorkflows.get(campaignId);
  if (!snapshot) {
    throw new Error(`No paused workflow found for campaign ${campaignId}`);
  }

  if (!approved) {
    await db
      .update(campaigns)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, campaignId))
      .run();
    pausedWorkflows.delete(campaignId);
    return;
  }

  // Transition state to approved and resumeschedule/schedulePosts
  const state = snapshot.state;
  state.humanApprovalStatus = 'approved' as const;
  pausedWorkflows.delete(campaignId);

  // Re-enter from the schedulePosts node to done
  const subGraph = new StateGraph<CampaignAgentState, any, any, any, any>({
    channels: {} as any,
  });

  subGraph.addNode('schedulePosts', schedulePosts);
  subGraph.addNode('monitorSetup', monitorSetup);
  subGraph.addNode('done', done);

  subGraph.addEdge(START, 'schedulePosts');
  subGraph.addEdge('schedulePosts', 'monitorSetup');
  subGraph.addEdge('monitorSetup', 'done');
  subGraph.addEdge('done', END);

  const compiled = subGraph.compile();
  await compiled.stream(state, { recursionLimit: 100, configurable: { thread_id: campaignId } });
}
