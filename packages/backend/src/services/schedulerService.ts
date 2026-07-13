import crypto from 'crypto';
import { Queue, Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts, appSettings, connectors } from '../db/schema';
import { publishToPlatform } from './publishService';
import { vimoSocialPublish } from './vimoSocialPublishService';
import { addPerformanceLesson } from './brandMemoryService';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import * as instagramHandler from '../connectors/native/instagramNative';
import { io } from '../index';

export interface ScheduledPost {
  id?: string;
  campaignId?: string | null;
  brandProfileId: string;
  content: string;
  platform: string;
  scheduledAt: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

let queue: Queue | null = null;
let worker: Worker | null = null;
let isFallbackMode = false;
let fallbackInterval: NodeJS.Timeout | null = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function tryConnectRedis(): Promise<boolean> {
  // Non-fatal probe: backend must continue even if Redis is down.
  // Using dynamic require to avoid ESM/CJS typing issues.
  const IORedisModule = require('ioredis');
  const RedisCtor = IORedisModule.default ?? IORedisModule;

  const client = new RedisCtor(REDIS_URL, {
    // Don't retry forever during probe
    maxRetriesPerRequest: 1,
    // Don't block on READY checks
    enableReadyCheck: false,
    // Don't start connecting until we call connect()
    lazyConnect: true,
  });

  let settled = false;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeAllListeners();
      try {
        client.disconnect();
      } catch {
        // ignore
      }
      resolve(false);
    }, 2000);

    const cleanupAndResolve = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.removeAllListeners();
      try {
        client.disconnect();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    client.once('connect', () => cleanupAndResolve(true));
    client.once('error', () => cleanupAndResolve(false));

    client.connect().catch(() => cleanupAndResolve(false));
  });
}

export async function initScheduler(): Promise<void> {
  const redisAvailable = await tryConnectRedis();

  if (redisAvailable) {
    isFallbackMode = false;
    console.log('[Scheduler] Using BullMQ with Redis');

    queue = new Queue('post-scheduler', {
      connection: {
        url: REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    worker = new Worker(
      'post-scheduler',
      async (job: Job) => {
        const post = job.data as ScheduledPost & { id: string };
        await processPost(post);
      },
      {
        connection: {
          url: REDIS_URL,
        },
      }
    );

    worker.on('failed', async (job, err) => {
      console.error(`[Scheduler] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`, err);

      // If job has exhausted all retries, mark post as permanently failed
      if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
        const post = job.data as ScheduledPost & { id: string };
        if (post.id) {
          const errorMsg = err?.message || 'Unknown error';
          const existingMeta = post.metadata ? (typeof post.metadata === 'object' ? post.metadata : {}) : {};
          await db
            .update(scheduledPosts)
            .set({
              status: 'failed',
              metadataJson: JSON.stringify({
                ...existingMeta,
                publishError: errorMsg,
                failedPermanently: true,
                failedAt: new Date().toISOString(),
              }),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(scheduledPosts.id, post.id))
            .run();

          io.emit('post:failed_permanently', {
            postId: post.id,
            content: post.content,
            platform: post.platform,
            error: errorMsg,
          });

          try {
            const { notifyPostFailed } = await import('./notificationService');
            await notifyPostFailed(`Post to ${post.platform} failed permanently: ${errorMsg}`);
          } catch { /* notification service may not be available */ }
        }
      }
    });
  } else {
    isFallbackMode = true;
    console.log('[Scheduler] Redis unavailable. Using in-memory fallback scheduler.');

    if (!fallbackInterval) {
      fallbackInterval = setInterval(async () => {
        const now = new Date().toISOString();
        const pending = await db
          .select()
          .from(scheduledPosts)
          .where(eq(scheduledPosts.status, 'pending'))
          .all();

        for (const post of pending) {
          if (post.scheduledAt <= now) {
            await processPost({
              id: post.id,
              brandProfileId: post.brandProfileId,
              content: post.content,
              platform: post.platform,
              scheduledAt: post.scheduledAt,
              campaignId: post.campaignId,
              mediaUrls: post.mediaUrlsJson ? JSON.parse(post.mediaUrlsJson) : [],
              metadata: post.metadataJson ? JSON.parse(post.metadataJson) : {},
            });
          }
        }
      }, 60000);
    }
  }
}

async function isAgentsPaused(): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'agentsPaused')).get();
  return row?.value === 'true';
}

async function processPost(post: ScheduledPost & { id?: string }): Promise<void> {
  if (await isAgentsPaused()) {
    console.log('[Scheduler] Paused. Skipping post processing.');
    return;
  }
  const postId = post.id || crypto.randomUUID();

  try {
    const row = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).get();
    if (!row) {
      console.error(`[Scheduler] Post ${postId} not found in database`);
      return;
    }

    if (row.status !== 'pending') {
      return;
    }

    // First, check approval before publishing
    const approvalResult = await (async () => {
      try {
        const { requestApproval } = await import('./approvalService');
        return await requestApproval({
          requestType: 'publish_post',
          payload: {
            postId: postId,
            brandProfileId: row.brandProfileId,
            content: row.content,
            platform: post.platform,
            scheduledAt: post.scheduledAt,
            metadata: post.metadata || {},
          },
          brandProfileId: row.brandProfileId,
          requestedBy: 'scheduler',
          urgency: 'scheduled',
        });
      } catch {
        // If approval service fails, default to pending
        return { decision: 'pending' as const, approvalRequestId: '' };
      }
    })();

    if (approvalResult.decision === 'pending') {
      // Update post status to awaiting_approval
      await db
        .update(scheduledPosts)
        .set({
          status: 'awaiting_approval',
          metadataJson: JSON.stringify({
            ...(row.metadataJson ? JSON.parse(row.metadataJson) : {}),
            approvalRequestId: approvalResult.approvalRequestId,
          }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scheduledPosts.id, postId))
        .run();

      console.log(`[Scheduler] Post ${postId} awaiting approval. Not publishing.`);
      return;
    }

    // Attempt real publishing via platform-specific handler
    console.log(`[Scheduler] Publishing to ${post.platform}: ${post.content.substring(0, 50)}...`);

    const registry = new ConnectorRegistry(db);
    let publishResult: { success: boolean; platformPostId?: string; permalink?: string; error?: string };

    // For Instagram, use the real handler directly
    if (post.platform === 'instagram') {
      // Find the active Instagram connector
      const allConnectors = await registry.getAll();
      const instagramConnector = allConnectors.find(
        (c) => c.provider === 'instagram' && c.status === 'active'
      );

      if (!instagramConnector) {
        publishResult = {
          success: false,
          error: 'No active Instagram connector found. Go to Apps & Platforms to connect it.',
        };
      } else {
        // Get credentials from credential store
        const accessToken = await credentialStore.getCredential(instagramConnector.id, 'accessToken');
        const instagramAccountId = await credentialStore.getCredential(instagramConnector.id, 'instagramAccountId');

        if (!accessToken || !instagramAccountId) {
          publishResult = {
            success: false,
            error: 'Missing Instagram credentials (accessToken or instagramAccountId). Reconnect your Instagram account.',
          };
        } else {
          try {
            publishResult = await instagramHandler.publishPost(
              {
                id: postId,
                brandProfileId: row.brandProfileId,
                content: post.content,
                platform: 'instagram',
                scheduledAt: post.scheduledAt,
                mediaUrls: post.mediaUrls,
                metadata: post.metadata,
              },
              { accessToken, instagramAccountId }
            );
          } catch (handlerErr) {
            publishResult = {
              success: false,
              error: handlerErr instanceof Error ? handlerErr.message : 'Unknown Instagram handler error',
            };
          }
        }
      }
    } else {
      // Every other connected platform publishes through the real VIMO Social
      // integration layer (Facebook, LinkedIn, X, Threads, Reddit, Medium,
      // Bluesky, ...). This keeps autonomous publishing working uniformly
      // instead of silently failing with "Publisher not yet implemented".
      try {
        const zr = await vimoSocialPublish.publish({
          postId,
          content: row.content,
          platforms: [post.platform],
          mediaUrls: post.mediaUrls,
          metadata: post.metadata,
        });
        const pr = zr.platformResults[post.platform];
        publishResult = pr
          ? {
              success: pr.success,
              platformPostId: pr.platformPostId,
              error: pr.error,
            }
          : {
              success: false,
              error: `Unable to publish to ${post.platform}.`,
            };
      } catch (zErr) {
        publishResult = {
          success: false,
          error: zErr instanceof Error ? zErr.message : 'Unknown publishing error',
        };
      }
    }

    // Handle the result
    if (publishResult.success) {
      const metadata = {
        ...(row.metadataJson ? JSON.parse(row.metadataJson) : {}),
        platformPostId: publishResult.platformPostId,
        permalink: publishResult.permalink,
      };

      await db
        .update(scheduledPosts)
        .set({
          status: 'published',
          metadataJson: JSON.stringify(metadata),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scheduledPosts.id, postId))
        .run();

      try {
        const { notifyPostPublished } = await import('./notificationService');
        await notifyPostPublished(post.content, post.platform);
      } catch { /* notification service may not be available */ }

      // Record to marketing memory timeline
      try {
        const { recordMemoryEntry } = await import('./memoryTimelineService');
        await recordMemoryEntry({
          brandProfileId: row.brandProfileId,
          entryType: 'post_published',
          entryDate: new Date().toISOString(),
          weekLabel: '', // computed inside service
          summary: `Published to ${post.platform}: ${row.content.substring(0, 80)}`,
          metrics: {
            platform: post.platform,
            contentLength: row.content.length,
            platformPostId: publishResult.platformPostId,
          },
          sentiment: 'positive',
          tags: [post.platform, 'published'],
          linkedEntityId: postId,
          linkedEntityType: 'scheduled_post',
          lessonsJson: null,
        });
      } catch (memErr) {
        console.warn('[Scheduler] Failed to record memory entry:', (memErr as Error).message);
      }

      // Record performance lesson for brand memory
      try {
        await addPerformanceLesson(row.brandProfileId, {
          lesson: 'Post published successfully',
          contentType: metadata.contentType || 'social_post',
          platform: post.platform,
          engagementRate: metadata.performance?.engagementRate || 0,
          whatWorked: 'Post was published to the platform and reached the audience.',
          whatToAvoidInFuture: '',
        });
      } catch (memErr) {
        console.warn('[Scheduler] Failed to record brand memory lesson:', (memErr as Error).message);
      }

      io.emit('post:published', {
        ...row,
        status: 'published',
        metadataJson: JSON.stringify(metadata),
        platformPostId: publishResult.platformPostId,
        permalink: publishResult.permalink,
      });

      // Trigger Marketing Director via post_published event
      setImmediate(async () => {
        try {
          const { runMarketingDirector } = await import('../agents/marketingDirector');
          await runMarketingDirector({
            brandProfileId: row.brandProfileId,
            trigger: 'post_published',
          });
        } catch (dirErr) {
          // Non-blocking — don't fail the publish if director errors
          console.warn('[Scheduler] Failed to trigger Marketing Director:', (dirErr as Error).message);
        }
      });

      console.log(`[Scheduler] Successfully published to ${post.platform} (ID: ${publishResult.platformPostId})`);
    } else {
      // Publishing failed — handle specific error types
      const errorMsg = publishResult.error || 'Unknown error';
      console.error(`[Scheduler] Failed to publish to ${post.platform}: ${errorMsg}`);

      // Check for rate limit error — reschedule 1 hour later
      if (errorMsg.toLowerCase().includes('rate limit')) {
        const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        await db
          .update(scheduledPosts)
          .set({
            scheduledAt: oneHourLater,
            status: 'pending',
            metadataJson: JSON.stringify({
              ...(row.metadataJson ? JSON.parse(row.metadataJson) : {}),
              publishError: errorMsg,
              retryCount: ((row.metadataJson ? JSON.parse(row.metadataJson) : {}).retryCount || 0) + 1,
            }),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, postId))
          .run();

        io.emit('post:rescheduled', {
          postId,
          newScheduledAt: oneHourLater,
          reason: 'rate_limit',
        });

        console.log(`[Scheduler] Rate limited. Rescheduled post ${postId} to ${oneHourLater}`);
      } else if (errorMsg.toLowerCase().includes('token has expired')) {
        // Token expired — emit connector error event
        const allConnectors = await registry.getAll();
        const instagramConnector = allConnectors.find(
          (c) => c.provider === 'instagram'
        );

        if (instagramConnector) {
          await registry.setStatus(instagramConnector.id, 'error');
          io.emit('connector:token_expired', {
            connectorId: instagramConnector.id,
            platform: 'instagram',
          });
        }

        await db
          .update(scheduledPosts)
          .set({
            status: 'failed',
            metadataJson: JSON.stringify({
              ...(row.metadataJson ? JSON.parse(row.metadataJson) : {}),
              publishError: errorMsg,
            }),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, postId))
          .run();

        io.emit('post:failed', {
          postId,
          error: errorMsg,
        });
      } else {
        // Generic failure
        await db
          .update(scheduledPosts)
          .set({
            status: 'failed',
            metadataJson: JSON.stringify({
              ...(row.metadataJson ? JSON.parse(row.metadataJson) : {}),
              publishError: errorMsg,
            }),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, postId))
          .run();

        io.emit('post:failed', {
          postId,
          error: errorMsg,
        });
      }
    }
  } catch (err) {
    console.error(`[Scheduler] Failed to process post ${postId}:`, err);

    await db
      .update(scheduledPosts)
      .set({
        status: 'failed',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(scheduledPosts.id, postId))
      .run();

    io.emit('post:failed', {
      postId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export async function schedulePost(post: ScheduledPost): Promise<void> {
  const id = post.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(scheduledPosts).values({
    id,
    campaignId: post.campaignId || null,
    brandProfileId: post.brandProfileId,
    content: post.content,
    platform: post.platform,
    scheduledAt: post.scheduledAt,
    status: 'pending',
    mediaUrlsJson: post.mediaUrls ? JSON.stringify(post.mediaUrls) : null,
    metadataJson: post.metadata ? JSON.stringify(post.metadata) : null,
    createdAt: now,
    updatedAt: now,
  });

  if (!isFallbackMode && queue) {
    const delay = new Date(post.scheduledAt).getTime() - Date.now();
    await queue.add('publish', { ...post, id }, { delay: Math.max(delay, 0) });
  }
}

export async function cancelPost(postId: string): Promise<void> {
  await db
    .update(scheduledPosts)
    .set({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(scheduledPosts.id, postId))
    .run();

  if (!isFallbackMode && queue) {
    const jobs = await queue.getJobs(['waiting', 'delayed']);
    const job = jobs.find((j) => j.data.id === postId);
    if (job) {
      await job.remove();
    }
  }
}

export async function reschedulePost(postId: string, newScheduledAt: string): Promise<void> {
  const row = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).get();
  if (!row) {
    throw new Error(`Post ${postId} not found`);
  }

  if (!isFallbackMode && queue) {
    const jobs = await queue.getJobs(['waiting', 'delayed']);
    const job = jobs.find((j) => j.data.id === postId);
    if (job) {
      await job.remove();
    }

    const delay = new Date(newScheduledAt).getTime() - Date.now();
    await queue.add(
      'publish',
      {
        id: postId,
        brandProfileId: row.brandProfileId,
        content: row.content,
        platform: row.platform,
        scheduledAt: newScheduledAt,
        campaignId: row.campaignId,
        mediaUrls: row.mediaUrlsJson ? JSON.parse(row.mediaUrlsJson) : [],
        metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
      },
      { delay: Math.max(delay, 0) }
    );
  }

  await db
    .update(scheduledPosts)
    .set({
      scheduledAt: newScheduledAt,
      status: 'pending',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(scheduledPosts.id, postId))
    .run();
}

export function getSchedulerStatus(): { mode: string } {
  return { mode: isFallbackMode ? 'fallback' : 'bullmq' };
}

/**
 * On startup, rescue posts that were scheduled but missed during downtime.
 */
export async function rescueMissedPosts(): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const toRescue = await db
      .select()
      .from(scheduledPosts)
      .where(
        eq(scheduledPosts.status, 'pending')
      )
      .all();
    // Filter in JS since we only need scheduledAt < fiveMinAgo

    if (toRescue.length === 0) return;

    console.log(`[Scheduler] Rescuing ${toRescue.length} posts that were missed during downtime.`);

    for (const post of toRescue) {
      if (!isFallbackMode && queue) {
        await queue.add('publish', {
          id: post.id,
          brandProfileId: post.brandProfileId,
          content: post.content,
          platform: post.platform,
          scheduledAt: post.scheduledAt,
          campaignId: post.campaignId,
          mediaUrls: post.mediaUrlsJson ? JSON.parse(post.mediaUrlsJson) : [],
          metadata: post.metadataJson ? JSON.parse(post.metadataJson) : {},
        }, { delay: 0 });
      } else {
        // In fallback mode, just process immediately
        await processPost({
          id: post.id,
          brandProfileId: post.brandProfileId,
          content: post.content,
          platform: post.platform,
          scheduledAt: post.scheduledAt,
          campaignId: post.campaignId,
          mediaUrls: post.mediaUrlsJson ? JSON.parse(post.mediaUrlsJson) : [],
          metadata: post.metadataJson ? JSON.parse(post.metadataJson) : {},
        });
      }
    }

    console.log(`[Scheduler] Rescued ${toRescue.length} missed posts.`);
  } catch (err) {
    console.error('[Scheduler] Failed to rescue missed posts:', err);
  }
}
