/**
 * Growth Loop Agent — Autonomous Growth Loop Engine
 *
 * Monitors post performance after publishing, detects high-performing content,
 * and autonomously triggers follow-up actions (variations, reposts, reels, A/B hooks).
 *
 * Runs as a LangGraph StateGraph with 5 nodes:
 *   fetchMetrics → analyzePerformance → decideActions → executeActions → updateBrandMemory
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { generateText } from 'ai';
import crypto from 'crypto';
import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts, growthActions, brandProfiles, agentLogs } from '../db/schema';
import { getActiveLLMProvider } from '../lib/llmProvider';
import { callLLMWithFallback } from '../lib/llmErrorHandler';
import { buildBrandContext } from '../services/brandBrainService';
import { fetchInstagramPostInsights } from '../services/performanceTrackerService';
import { generatePost, generateVariants } from '../services/contentGenerationService';
import { generateReelsScript } from '../services/reelsScriptService';
import { schedulePost } from '../services/schedulerService';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import { io } from '../index';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const HIGH_PERFORMANCE_THRESHOLDS = {
  engagementRate: 5.0,   // percent
  saves: 50,
  reach: 5000,
  commentsIn6Hours: 20,
} as const;

/* ------------------------------------------------------------------ */
/*  State Interface                                                    */
/* ------------------------------------------------------------------ */

interface GrowthLoopState {
  postId: string;
  platform: string;
  brandProfileId: string;
  metrics: {
    likes: number;
    comments: number;
    reach: number;
    saves: number;
    shares: number;
    engagementRate: number;
  };
  isHighPerformer: boolean;
  audienceInsight: string | null;
  actions: string[];
  completedAt: string | null;
  // Internal fields used during graph execution
  content?: string;
  topPerformingElement?: string;
  contentType?: string;
  recommendedFollowUps?: string[];
  brandProfileName?: string;
  // Brand brain
  performanceLessons?: Array<{
    learnedAt: string;
    lesson: string;
    audienceWhoEngaged: string;
    contentType: string;
    engagementRate: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isOlderThan2Hours(isoTimestamp: string | undefined): boolean {
  if (!isoTimestamp) return true;
  const then = new Date(isoTimestamp).getTime();
  return Date.now() - then > 2 * 60 * 60 * 1000;
}

function isWithin6Hours(publishedAt: string): boolean {
  return Date.now() - new Date(publishedAt).getTime() < 6 * 60 * 60 * 1000;
}

async function logAgentAction(params: {
  action: string;
  input: string;
  output: string;
  status: string;
  durationMs: number;
}) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    agentType: 'growth_loop',
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
/*  Node 1 — fetchMetrics                                              */
/* ------------------------------------------------------------------ */

async function fetchMetricsNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  const start = Date.now();
  try {
    const post = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, state.postId))
      .get();

    if (!post) {
      throw new Error(`Post ${state.postId} not found`);
    }

    const metadata = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const performance = metadata.performance || {};
    const publishedAt = post.scheduledAt;

    // Default metrics from stored performance data
    let metrics = {
      likes: performance.likes ?? 0,
      comments: performance.comments ?? 0,
      reach: performance.reach ?? 0,
      saves: performance.saves ?? 0,
      shares: performance.shares ?? 0,
      engagementRate: performance.engagementRate ?? 0,
    };

    // If metrics were last updated more than 2h ago, refresh from Instagram API
    if (isOlderThan2Hours(performance.lastRefreshed)) {
      const platformPostId = metadata.platformPostId;
      if (platformPostId) {
        try {
          const registry = new ConnectorRegistry(db);
          const allConnectors = await registry.getAll();
          const instagramConnector = allConnectors.find(
            (c) => c.provider === 'instagram' && c.status === 'active'
          );

          if (instagramConnector) {
            const accessToken = await credentialStore.getCredential(
              instagramConnector.id,
              'accessToken'
            );
            if (accessToken) {
              const fresh = await fetchInstagramPostInsights(platformPostId, accessToken);
              metrics = {
                likes: fresh.likes,
                comments: fresh.comments,
                reach: fresh.reach,
                saves: fresh.saves,
                shares: fresh.shares,
                engagementRate: fresh.engagementRate,
              };

              // Update stored metrics
              const updatedMetadata = {
                ...metadata,
                performance: {
                  ...metrics,
                  lastRefreshed: new Date().toISOString(),
                },
              };
              await db
                .update(scheduledPosts)
                .set({
                  metadataJson: JSON.stringify(updatedMetadata),
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(scheduledPosts.id, state.postId))
                .run();
            }
          }
        } catch (err) {
          console.warn(`[GrowthLoop] Failed to refresh metrics for post ${state.postId}:`, (err as Error).message);
          // Continue with existing metrics
        }
      }
    }

    // Determine if post is a high performer
    const within6h = isWithin6Hours(publishedAt);
    const isHighPerformer =
      metrics.engagementRate > HIGH_PERFORMANCE_THRESHOLDS.engagementRate ||
      metrics.saves > HIGH_PERFORMANCE_THRESHOLDS.saves ||
      metrics.reach > HIGH_PERFORMANCE_THRESHOLDS.reach ||
      (within6h && metrics.comments > HIGH_PERFORMANCE_THRESHOLDS.commentsIn6Hours);

    await logAgentAction({
      action: 'fetchMetrics',
      input: JSON.stringify({ postId: state.postId }),
      output: JSON.stringify({ metrics, isHighPerformer }),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return {
      ...state,
      metrics,
      isHighPerformer,
      platform: post.platform,
      content: post.content,
      brandProfileId: post.brandProfileId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] fetchMetrics error:`, msg);
    await logAgentAction({
      action: 'fetchMetrics',
      input: JSON.stringify({ postId: state.postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Node 2 — analyzePerformance                                         */
/* ------------------------------------------------------------------ */

async function analyzePerformanceNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  const start = Date.now();
  try {
    if (!state.content) throw new Error('No post content available for analysis');

    const brandContext = await buildBrandContext(state.brandProfileId, state.content);
    const { provider, modelId } = await getActiveLLMProvider('growth analysis');

    const prompt = `You are a marketing performance analyst. A post just performed unusually well.

Post content: ${state.content}
Platform: ${state.platform}
Metrics: reach ${state.metrics.reach}, engagement rate ${state.metrics.engagementRate}%, saves ${state.metrics.saves}, comments ${state.metrics.comments}
Brand profile: ${brandContext}

Analyze who this content resonated with and why.

Return JSON with fields:
  audienceInsight (one sentence describing who engaged most and why),
  topPerformingElement (what specifically made this work — the hook, the format, the topic, or the timing),
  recommendedFollowUps (array of exactly 3 strings, each describing a specific follow-up content piece to create)`;

    const text = await callLLMWithFallback(
      async () => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return t;
      },
      () => {
        return JSON.stringify({
          audienceInsight: 'This content resonated with engaged followers who value authentic, value-driven posts about this topic.',
          topPerformingElement: 'The hook and timing combined to drive strong engagement.',
          recommendedFollowUps: [
            'Create a variation of this post with a stronger call-to-action',
            'Repurpose this content for a different platform to reach new audiences',
            'Test a video/reel version of this topic to compare engagement',
          ],
        });
      },
      'growth analysis'
    );

    const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));

    await logAgentAction({
      action: 'analyzePerformance',
      input: JSON.stringify({ postId: state.postId, metrics: state.metrics }),
      output: JSON.stringify(parsed),
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return {
      ...state,
      audienceInsight: parsed.audienceInsight || null,
      topPerformingElement: parsed.topPerformingElement || '',
      recommendedFollowUps: Array.isArray(parsed.recommendedFollowUps)
        ? parsed.recommendedFollowUps.slice(0, 3)
        : [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] analyzePerformance error:`, msg);
    await logAgentAction({
      action: 'analyzePerformance',
      input: JSON.stringify({ postId: state.postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Node 3 — decideActions                                              */
/* ------------------------------------------------------------------ */

async function decideActionsNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  const start = Date.now();
  try {
    if (!state.recommendedFollowUps || state.recommendedFollowUps.length === 0) {
      return { ...state, actions: [] };
    }

    // Map from recommendedFollowUps to action types based on content
    const actionTypes = ['generate_variation', 'repost_to_platform', 'create_reel', 'test_stronger_hook'] as const;
    const actionIds: string[] = [];

    for (let i = 0; i < state.recommendedFollowUps.length; i++) {
      // Distribute action types across the 3 recommendations
      const actionType = actionTypes[i % actionTypes.length];
      const id = crypto.randomUUID();

      await db.insert(growthActions).values({
        id,
        sourcePostId: state.postId,
        brandProfileId: state.brandProfileId,
        actionType,
        description: state.recommendedFollowUps[i],
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      actionIds.push(id);
    }

    // Emit socket event so frontend can react
    io.emit('growth_loop:actions_created', {
      sourcePostId: state.postId,
      actions: actionIds.map((id, i) => ({
        id,
        actionType: actionTypes[i % actionTypes.length],
        description: state.recommendedFollowUps![i],
        status: 'pending',
      })),
    });

    await logAgentAction({
      action: 'decideActions',
      input: JSON.stringify({ postId: state.postId, followUps: state.recommendedFollowUps }),
      output: `Created ${actionIds.length} growth actions`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return { ...state, actions: actionIds };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] decideActions error:`, msg);
    await logAgentAction({
      action: 'decideActions',
      input: JSON.stringify({ postId: state.postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Node 4 — executeActions                                             */
/* ------------------------------------------------------------------ */

async function executeActionsNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  const start = Date.now();
  try {
    if (state.actions.length === 0) return state;

    const allPending = db
      .select()
      .from(growthActions)
      .where(eq(growthActions.status, 'pending'))
      .all();
    const pendingActions = allPending.filter((a: { id: string }) => state.actions.includes(a.id));

    for (const action of pendingActions) {
      // Mark as executing
      await db
        .update(growthActions)
        .set({ status: 'executing' })
        .where(eq(growthActions.id, action.id))
        .run();

      try {
        switch (action.actionType) {
          case 'generate_variation': {
            const result = await generatePost({
              brandProfileId: state.brandProfileId,
              platform: state.platform,
              topic: state.content || action.description,
              additionalContext: state.audienceInsight || undefined,
            });

            // Store as draft scheduled post for user review
            const postId = crypto.randomUUID();
            const now = new Date().toISOString();
            await db.insert(scheduledPosts).values({
              id: postId,
              brandProfileId: state.brandProfileId,
              content: result.content,
              platform: state.platform,
              scheduledAt: now,
              status: 'draft',
              metadataJson: JSON.stringify({
                hashtags: result.hashtags,
                imageSuggestion: result.imageSuggestion,
                generatedBy: 'growth_loop',
                sourcePostId: state.postId,
                growthActionId: action.id,
                contentType: result.contentType,
              }),
              createdAt: now,
              updatedAt: now,
            });

            await db
              .update(growthActions)
              .set({ status: 'completed' })
              .where(eq(growthActions.id, action.id))
              .run();
            break;
          }

          case 'repost_to_platform': {
            // Identify which platforms the original post has NOT been posted to
            const brandConnectors = await new ConnectorRegistry(db).getAll();
            const allPlatforms = [...new Set(brandConnectors.map((c) => c.provider))];

            // Find existing posts for this brand to check which platforms have been used
            const brandPosts = db
              .select({ platform: scheduledPosts.platform, metadataJson: scheduledPosts.metadataJson })
              .from(scheduledPosts)
              .where(eq(scheduledPosts.brandProfileId, state.brandProfileId))
              .all();

            // Collect platforms already used and check metadata for sourcePostId
            const existingPlatforms = new Set<string>();
            existingPlatforms.add(state.platform);
            for (const bp of brandPosts) {
              if (bp.platform) existingPlatforms.add(bp.platform);
            }

            const targetPlatforms = allPlatforms.filter((p) => !existingPlatforms.has(p));

            if (targetPlatforms.length === 0) {
              // Fallback: repost to a different major platform
              const fallbackPlatforms = ['instagram', 'linkedin', 'twitter', 'tiktok'];
              const available = fallbackPlatforms.filter((p) => p !== state.platform);
              const targetPlatform = available[0] || 'instagram';

              const result = await generatePost({
                brandProfileId: state.brandProfileId,
                platform: targetPlatform,
                topic: state.content || action.description,
                additionalContext: `Adapt this content from ${state.platform} to ${targetPlatform}. ${state.audienceInsight || ''}`,
              });

              const scheduledFor = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

              await schedulePost({
                id: crypto.randomUUID(),
                brandProfileId: state.brandProfileId,
                content: result.content,
                platform: targetPlatform,
                scheduledAt: scheduledFor,
                metadata: {
                  hashtags: result.hashtags,
                  generatedBy: 'growth_loop',
                  sourcePostId: state.postId,
                  growthActionId: action.id,
                },
              });
            } else {
              for (const targetPlatform of targetPlatforms) {
                const result = await generatePost({
                  brandProfileId: state.brandProfileId,
                  platform: targetPlatform,
                  topic: state.content || action.description,
                  additionalContext: `Adapt this content from ${state.platform} to ${targetPlatform}. ${state.audienceInsight || ''}`,
                });

                const scheduledFor = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

                await schedulePost({
                  id: crypto.randomUUID(),
                  brandProfileId: state.brandProfileId,
                  content: result.content,
                  platform: targetPlatform,
                  scheduledAt: scheduledFor,
                  metadata: {
                    hashtags: result.hashtags,
                    generatedBy: 'growth_loop',
                    sourcePostId: state.postId,
                    growthActionId: action.id,
                  },
                });
              }
            }

            await db
              .update(growthActions)
              .set({ status: 'completed' })
              .where(eq(growthActions.id, action.id))
              .run();
            break;
          }

          case 'test_stronger_hook': {
            const variants = await generateVariants({
              brandProfileId: state.brandProfileId,
              platform: state.platform,
              topic: state.content || action.description,
              count: 3,
            });

            const now = new Date().toISOString();
            for (const variant of variants) {
              const postId = crypto.randomUUID();
              await db.insert(scheduledPosts).values({
                id: postId,
                brandProfileId: state.brandProfileId,
                content: variant.content,
                platform: state.platform,
                scheduledAt: now,
                status: 'draft',
                metadataJson: JSON.stringify({
                  hashtags: variant.hashtags,
                  tone: variant.tone,
                  generatedBy: 'growth_loop',
                  sourcePostId: state.postId,
                  growthActionId: action.id,
                  variantType: 'stronger_hook_test',
                }),
                createdAt: now,
                updatedAt: now,
              });
            }

            await db
              .update(growthActions)
              .set({ status: 'completed' })
              .where(eq(growthActions.id, action.id))
              .run();
            break;
          }

          case 'create_reel': {
            const script = await generateReelsScript({
              brandProfileId: state.brandProfileId,
              topic: state.content || action.description,
              targetDuration: 30,
              reelsStyle: 'talking_head',
            });

            // Store the script as a draft post with reel metadata
            const now = new Date().toISOString();
            const postId = crypto.randomUUID();
            await db.insert(scheduledPosts).values({
              id: postId,
              brandProfileId: state.brandProfileId,
              content: script.caption,
              platform: 'instagram',
              scheduledAt: now,
              status: 'draft',
              metadataJson: JSON.stringify({
                generatedBy: 'growth_loop',
                sourcePostId: state.postId,
                growthActionId: action.id,
                reelScript: JSON.stringify(script),
                isReel: true,
              }),
              createdAt: now,
              updatedAt: now,
            });

            await db
              .update(growthActions)
              .set({ status: 'completed' })
              .where(eq(growthActions.id, action.id))
              .run();
            break;
          }

          default:
            await db
              .update(growthActions)
              .set({ status: 'failed' })
              .where(eq(growthActions.id, action.id))
              .run();
        }
      } catch (actionErr) {
        console.error(`[GrowthLoop] Action ${action.id} failed:`, (actionErr as Error).message);
        await db
          .update(growthActions)
          .set({ status: 'failed' })
          .where(eq(growthActions.id, action.id))
          .run();
      }
    }

    // Emit completion event
    io.emit('growth_loop:complete', {
      sourcePostId: state.postId,
      actionsProcessed: pendingActions.length,
    });

    await logAgentAction({
      action: 'executeActions',
      input: JSON.stringify({ postId: state.postId, actionCount: pendingActions.length }),
      output: `Processed ${pendingActions.length} actions`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] executeActions error:`, msg);
    await logAgentAction({
      action: 'executeActions',
      input: JSON.stringify({ postId: state.postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Node 5 — updateBrandMemory                                          */
/* ------------------------------------------------------------------ */

async function updateBrandMemoryNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  const start = Date.now();
  try {
    if (!state.topPerformingElement || !state.audienceInsight) {
      return state;
    }

    const brandRow = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, state.brandProfileId))
      .get();

    if (!brandRow) {
      console.warn(`[GrowthLoop] Brand profile ${state.brandProfileId} not found for memory update`);
      return state;
    }

    // Parse the existing voiceFingerprint
    const voiceFingerprint = brandRow.voiceFingerprint
      ? JSON.parse(brandRow.voiceFingerprint)
      : {};

    // Initialize performanceLessons array
    const performanceLessons: Array<{
      learnedAt: string;
      lesson: string;
      audienceWhoEngaged: string;
      contentType: string;
      engagementRate: number;
    }> = voiceFingerprint.performanceLessons || [];

    // Add new lesson
    performanceLessons.push({
      learnedAt: new Date().toISOString(),
      lesson: state.topPerformingElement,
      audienceWhoEngaged: state.audienceInsight,
      contentType: 'social_post',
      engagementRate: state.metrics.engagementRate,
    });

    // Keep only the last 20 lessons
    const trimmed = performanceLessons.slice(-20);

    // Write back
    const updatedFingerprint = {
      ...voiceFingerprint,
      performanceLessons: trimmed,
    };

    await db
      .update(brandProfiles)
      .set({
        voiceFingerprint: JSON.stringify(updatedFingerprint),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(brandProfiles.id, state.brandProfileId))
      .run();

    await logAgentAction({
      action: 'updateBrandMemory',
      input: JSON.stringify({ brandProfileId: state.brandProfileId }),
      output: `Updated performance lessons (${trimmed.length} total)`,
      status: 'complete',
      durationMs: Date.now() - start,
    });

    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] updateBrandMemory error:`, msg);
    await logAgentAction({
      action: 'updateBrandMemory',
      input: JSON.stringify({ postId: state.postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Node — done                                                        */
/* ------------------------------------------------------------------ */

async function doneNode(state: GrowthLoopState): Promise<GrowthLoopState> {
  return { ...state, completedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/*  Graph wiring                                                       */
/* ------------------------------------------------------------------ */

const stateGraph = new StateGraph<GrowthLoopState, any, any, any, any>({
  channels: {} as any,
});

stateGraph.addNode('fetchMetrics', fetchMetricsNode);
stateGraph.addNode('analyzePerformance', analyzePerformanceNode);
stateGraph.addNode('decideActions', decideActionsNode);
stateGraph.addNode('executeActions', executeActionsNode);
stateGraph.addNode('updateBrandMemory', updateBrandMemoryNode);
stateGraph.addNode('done', doneNode);

stateGraph.addEdge(START, 'fetchMetrics');
stateGraph.addEdge('fetchMetrics', 'analyzePerformance');
stateGraph.addConditionalEdges(
  'analyzePerformance',
  async (state: GrowthLoopState) => {
    if (!state.isHighPerformer) {
      return 'done';
    }
    return 'decideActions';
  }
);
stateGraph.addEdge('decideActions', 'executeActions');
stateGraph.addEdge('executeActions', 'updateBrandMemory');
stateGraph.addEdge('updateBrandMemory', END);
stateGraph.addEdge('done', END);

const graph = stateGraph.compile();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Run the growth loop for a single post.
 * Loads the post, builds initial state, streams the graph, and logs errors.
 */
export async function runGrowthLoop(postId: string): Promise<void> {
  const start = Date.now();
  try {
    const post = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, postId))
      .get();

    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    const metadata = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const performance = metadata.performance || {};

    const initialState: GrowthLoopState = {
      postId,
      platform: post.platform,
      brandProfileId: post.brandProfileId,
      metrics: {
        likes: performance.likes ?? 0,
        comments: performance.comments ?? 0,
        reach: performance.reach ?? 0,
        saves: performance.saves ?? 0,
        shares: performance.shares ?? 0,
        engagementRate: performance.engagementRate ?? 0,
      },
      isHighPerformer: false,
      audienceInsight: null,
      actions: [],
      completedAt: null,
    };

    await graph.stream(initialState, {
      recursionLimit: 50,
      configurable: { thread_id: `growth_loop_${postId}` },
    });

    await logAgentAction({
      action: 'runGrowthLoop',
      input: JSON.stringify({ postId }),
      output: 'Completed successfully',
      status: 'complete',
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GrowthLoop] runGrowthLoop error for post ${postId}:`, msg);

    await logAgentAction({
      action: 'runGrowthLoop',
      input: JSON.stringify({ postId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
  }
}
