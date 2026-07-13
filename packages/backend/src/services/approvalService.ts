/**
 * Approval Service — Central Gatekeeper
 *
 * Every autonomous action that affects external platforms must go through
 * requestApproval before execution. This service checks the current approval
 * mode, applies rules, and either auto-approves or queues for human review.
 */

import crypto from 'crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { approvalRequests, appSettings, scheduledPosts } from '../db/schema';
import { io } from '../index';
// ApprovalMode and ApprovalRules types
// Using inline definitions since the shared package may not resolve in all tsconfig setups
export enum ApprovalMode {
  SAFE = 'safe',
  ASSISTED = 'assisted',
  AUTONOMOUS = 'autonomous',
}

export interface ApprovalRules {
  maxAutoPostsPerDay: number;
  requireApprovalForFirstPostOfDay: boolean;
  requireApprovalForPromoContent: boolean;
  autoApproveEngagementRepliesAboveConfidence: number;
  blockedHours: number[];
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type ApprovalRequestType = 'publish_post' | 'send_reply' | 'start_campaign' | 'execute_director_action';
export type ApprovalUrgency = 'immediate' | 'scheduled' | 'low';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'expired';

export interface ApprovalRequest {
  id: string;
  requestType: ApprovalRequestType;
  payload: Record<string, unknown>;
  brandProfileId: string;
  requestedBy: string;
  urgency: ApprovalUrgency;
  status: ApprovalStatus;
  expiresAt: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
}

export interface ApprovalRequestResult {
  decision: 'approved' | 'pending' | 'rejected';
  approvalRequestId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getSetting(key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, updatedAt: new Date().toISOString() }).run();
  }
}

function parseApprovalRules(): ApprovalRules {
  const raw = getSetting('approvalRules');
  if (!raw) {
    return {
      maxAutoPostsPerDay: 5,
      requireApprovalForFirstPostOfDay: true,
      requireApprovalForPromoContent: true,
      autoApproveEngagementRepliesAboveConfidence: 85,
      blockedHours: [0, 1, 2, 3, 4, 5, 6],
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      maxAutoPostsPerDay: 5,
      requireApprovalForFirstPostOfDay: true,
      requireApprovalForPromoContent: true,
      autoApproveEngagementRepliesAboveConfidence: 85,
      blockedHours: [0, 1, 2, 3, 4, 5, 6],
    };
  }
}

function getApprovalMode(): ApprovalMode {
  const mode = getSetting('approvalMode') || 'assisted';
  return mode as ApprovalMode;
}

function getAutoPostCountToday(): number {
  const todayStart = new Date().toISOString().split('T')[0];
  const count = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(approvalRequests)
    .where(
      sql`${approvalRequests.requestType} = 'publish_post' AND ${approvalRequests.status} IN ('approved', 'auto_approved') AND ${approvalRequests.createdAt} >= ${todayStart}`
    )
    .get() as unknown as { count: number } | undefined;
  return count?.count ?? 0;
}

function isBlockedHour(): boolean {
  const rules = parseApprovalRules();
  const currentHour = new Date().getHours();
  return rules.blockedHours.includes(currentHour);
}

function hasAutoApprovedPostToday(): boolean {
  const todayStart = new Date().toISOString().split('T')[0];
  const first = db
    .select()
    .from(approvalRequests)
    .where(
      sql`${approvalRequests.requestType} = 'publish_post' AND ${approvalRequests.status} = 'auto_approved' AND ${approvalRequests.createdAt} >= ${todayStart}`
    )
    .limit(1)
    .get();
  return !!first;
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Every part of the system calls this before doing anything external.
 * Returns a decision: 'approved' (auto), 'pending' (needs human review), or 'rejected'.
 */
export async function requestApproval(
  request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt' | 'expiresAt'>
): Promise<ApprovalRequestResult> {
  const now = new Date();
  const id = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // expires in 24h

  const approvalMode = getApprovalMode();
  const rules = parseApprovalRules();
  const payload = request.payload;

  let decision: ApprovalStatus = 'pending';
  let autoApprove = false;

  if (approvalMode === 'safe') {
    // SAFE mode: never auto-approve anything
    decision = 'pending';
  } else if (approvalMode === 'autonomous') {
    // AUTONOMOUS mode: check rules
    autoApprove = true;

    if (request.requestType === 'publish_post') {
      // Check blocked hours
      if (isBlockedHour()) {
        autoApprove = false;
      }
      // Check max auto posts per day
      const todayCount = getAutoPostCountToday();
      if (todayCount >= rules.maxAutoPostsPerDay) {
        autoApprove = false;
      }
      // Check first post of day requires approval
      if (rules.requireApprovalForFirstPostOfDay && !hasAutoApprovedPostToday()) {
        autoApprove = false;
      }
      // Check promo content flag
      if (rules.requireApprovalForPromoContent && (payload as any)?.isPromoContent) {
        autoApprove = false;
      }
    } else if (request.requestType === 'send_reply') {
      // Check confidence threshold
      const confidence = (payload as any)?.confidence ?? 0;
      if (confidence < rules.autoApproveEngagementRepliesAboveConfidence) {
        autoApprove = false;
      }
    } else {
      // start_campaign and execute_director_action always need approval in autonomous
      autoApprove = false;
    }

    decision = autoApprove ? 'auto_approved' : 'pending';
  } else {
    // ASSISTED mode
    if (request.requestType === 'send_reply') {
      const confidence = (payload as any)?.confidence ?? 0;
      if (confidence >= rules.autoApproveEngagementRepliesAboveConfidence) {
        decision = 'auto_approved';
      } else {
        decision = 'pending';
      }
    } else {
      // publish_post, start_campaign, execute_director_action always return pending in assisted mode
      decision = 'pending';
    }
  }

  // Insert the approval request record
  await db.insert(approvalRequests).values({
    id,
    requestType: request.requestType,
    payloadJson: JSON.stringify(payload),
    brandProfileId: request.brandProfileId,
    requestedBy: request.requestedBy,
    urgency: request.urgency,
    status: decision,
    reviewedAt: decision !== 'pending' ? createdAt : null,
    reviewedBy: decision !== 'pending' ? 'system' : null,
    rejectionReason: null,
    createdAt,
    expiresAt,
  });

  // If pending, emit socket event
  if (decision === 'pending') {
    const summary = getHumanReadableSummary(request.requestType, payload);
    try {
      io?.emit('approval:requested', {
        approvalRequestId: id,
        requestType: request.requestType,
        requestedBy: request.requestedBy,
        summary,
      });
    } catch {
      // Socket may not be available
    }
  }

  return {
    decision: decision === 'auto_approved' ? 'approved' : decision,
    approvalRequestId: id,
  };
}

/**
 * Approve a pending request. Calls executeApprovedRequest to actually perform the action.
 */
export async function approveRequest(approvalRequestId: string): Promise<void> {
  const request = db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId))
    .get();

  if (!request) {
    throw new Error(`Approval request ${approvalRequestId} not found`);
  }

  if (request.status !== 'pending') {
    throw new Error(`Approval request ${approvalRequestId} is not in pending status (current: ${request.status})`);
  }

  const now = new Date().toISOString();

  await db
    .update(approvalRequests)
    .set({
      status: 'approved',
      reviewedAt: now,
      reviewedBy: 'human',
    })
    .where(eq(approvalRequests.id, approvalRequestId))
    .run();

  // Execute the approved action
  await executeApprovedRequest(approvalRequestId);

  try {
    io?.emit('approval:executed', {
      approvalRequestId,
      requestType: request.requestType,
    });
  } catch {
    // Socket may not be available
  }
}

/**
 * Execute the deferred action after approval.
 */
export async function executeApprovedRequest(approvalRequestId: string): Promise<void> {
  const request = db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId))
    .get();

  if (!request) return;

  const payload = JSON.parse(request.payloadJson);

  switch (request.requestType) {
    case 'publish_post': {
      // Handle both single post and batch payloads
      const posts = (payload as any)?.posts || [(payload as any)];
      const postArray = Array.isArray(posts) ? posts : [posts];

      for (const postData of postArray) {
        const postId = postData.postId;
        if (!postId) continue;

        // Move the post to the scheduler queue by setting status to 'pending'
        await db
          .update(scheduledPosts)
          .set({
            status: 'pending',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, postId))
          .run();

        // Also add to BullMQ if available
        try {
          const { schedulePost } = await import('./schedulerService');
          await schedulePost({
            id: postId,
            brandProfileId: postData.brandProfileId || (payload as any).brandProfileId || '',
            content: postData.content || '',
            platform: postData.platform || '',
            scheduledAt: postData.scheduledAt || new Date().toISOString(),
            metadata: postData.metadata || {},
          });
        } catch {
          // Fallback mode - just saved to DB
        }
      }
      break;
    }

    case 'send_reply': {
      // Send the reply via Instagram handler
      try {
        const { replyToComment } = await import('../connectors/native/instagramNative');
        const result = await replyToComment({
          commentId: (payload as any).commentId || '',
          replyText: (payload as any).replyText || '',
          accessToken: (payload as any).accessToken || '',
        });

        // Update the engagement queue item
        const { engagementQueue: eqTable } = await import('../db/schema');
        const itemId = (payload as any).engagementItemId;
        if (itemId && result?.replyId) {
          const existingMeta = db
            .select({ metadataJson: eqTable.metadataJson })
            .from(eqTable)
            .where(eq(eqTable.id, itemId))
            .get() as { metadataJson: string | null } | undefined;

          const meta = existingMeta?.metadataJson ? JSON.parse(existingMeta.metadataJson) : {};
          await db
            .update(eqTable)
            .set({
              replyStatus: 'auto_replied',
              status: 'replied',
              metadataJson: JSON.stringify({ ...meta, replyId: result.replyId }),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(eqTable.id, itemId))
            .run();
        }
      } catch (err) {
        console.error('[ApprovalService] Failed to execute approved reply:', err);
      }
      break;
    }

    case 'start_campaign': {
      // Start the campaign agent
      try {
        const { startCampaign } = await import('./campaignService');
        await startCampaign((payload as any).campaignId || '', {
          requiresHumanApproval: (payload as any).requiresHumanApproval ?? true,
        });
      } catch (err) {
        console.error('[ApprovalService] Failed to execute approved campaign:', err);
      }
      break;
    }

    case 'execute_director_action': {
      // Execute director action - mark as executed and potentially create content
      try {
        const { markActionExecuted } = await import('../agents/marketingDirector');
        const sessionId = (payload as any).sessionId || '';
        const actionId = (payload as any).actionId || '';
        if (sessionId && actionId) {
          await markActionExecuted(sessionId, actionId);
        }
      } catch (err) {
        console.error('[ApprovalService] Failed to execute director action:', err);
      }
      break;
    }

    default:
      console.warn(`[ApprovalService] Unknown request type: ${request.requestType}`);
  }
}

/**
 * Reject a pending request.
 */
export async function rejectRequest(approvalRequestId: string, reason?: string): Promise<void> {
  const request = db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId))
    .get();

  if (!request) {
    throw new Error(`Approval request ${approvalRequestId} not found`);
  }

  const now = new Date().toISOString();

  await db
    .update(approvalRequests)
    .set({
      status: 'rejected',
      reviewedAt: now,
      reviewedBy: 'human',
      rejectionReason: reason || null,
    })
    .where(eq(approvalRequests.id, approvalRequestId))
    .run();

  // For publish_post actions, update the associated post status
  if (request.requestType === 'publish_post') {
    const payload = JSON.parse(request.payloadJson);
    const postId = (payload as any)?.postId;
    if (postId) {
      await db
        .update(scheduledPosts)
        .set({
          status: 'cancelled',
          updatedAt: now,
        })
        .where(eq(scheduledPosts.id, postId))
        .run();
    }
  }

  try {
    io?.emit('approval:rejected', {
      approvalRequestId,
      requestType: request.requestType,
      reason: reason || undefined,
    });
  } catch {
    // Socket may not be available
  }
}

/**
 * Get all pending approval requests, sorted by urgency then createdAt.
 */
export async function getApprovalQueue(): Promise<(ApprovalRequest & { humanReadableSummary: string })[]> {
  const rows = db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.status, 'pending'))
    .orderBy(desc(approvalRequests.urgency), desc(approvalRequests.createdAt))
    .all();

  return rows.map((row) => {
    const payload = JSON.parse(row.payloadJson);
    return {
      id: row.id,
      requestType: row.requestType as ApprovalRequestType,
      payload,
      brandProfileId: row.brandProfileId,
      requestedBy: row.requestedBy,
      urgency: row.urgency as ApprovalUrgency,
      status: row.status as ApprovalStatus,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedBy,
      rejectionReason: row.rejectionReason,
      humanReadableSummary: getHumanReadableSummary(row.requestType as ApprovalRequestType, payload),
    };
  });
}

/**
 * Get count of pending approval requests.
 */
export async function getApprovalQueueCount(): Promise<number> {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(approvalRequests)
    .where(eq(approvalRequests.status, 'pending'))
    .get() as unknown as { count: number } | undefined;
  return result?.count ?? 0;
}

/**
 * Approve all pending requests of a specific type.
 */
export async function approveAllByType(requestType: ApprovalRequestType): Promise<number> {
  const pending = db
    .select()
    .from(approvalRequests)
    .where(
      sql`${approvalRequests.requestType} = ${requestType} AND ${approvalRequests.status} = 'pending'`
    )
    .all();

  for (const request of pending) {
    await approveRequest(request.id);
  }

  return pending.length;
}

/* ------------------------------------------------------------------ */
/*  Settings Helpers                                                   */
/* ------------------------------------------------------------------ */

export async function getApprovalSettings(): Promise<{ mode: string; rules: ApprovalRules }> {
  return {
    mode: getApprovalMode(),
    rules: parseApprovalRules(),
  };
}

export async function updateApprovalSettings(data: {
  mode?: ApprovalMode;
  rules?: Partial<ApprovalRules>;
}): Promise<void> {
  if (data.mode) {
    setSetting('approvalMode', data.mode);
  }

  if (data.rules) {
    const current = parseApprovalRules();
    const updated = { ...current, ...data.rules };
    setSetting('approvalRules', JSON.stringify(updated));
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getHumanReadableSummary(
  requestType: ApprovalRequestType,
  payload: Record<string, unknown>
): string {
  switch (requestType) {
    case 'publish_post': {
      const content = ((payload as any)?.content || '').substring(0, 80);
      const platform = (payload as any)?.platform || 'social';
      const scheduledAt = (payload as any)?.scheduledAt;
      const timeStr = scheduledAt
        ? new Date(scheduledAt).toLocaleString()
        : 'as soon as possible';
      return `Post "${content}" to ${platform} at ${timeStr}`;
    }
    case 'send_reply': {
      const replyText = ((payload as any)?.replyText || '').substring(0, 60);
      const author = (payload as any)?.authorName || 'a user';
      return `Reply "${replyText}" to ${author}`;
    }
    case 'start_campaign': {
      const name = (payload as any)?.campaignName || (payload as any)?.campaignId || 'a campaign';
      return `Start campaign "${name}"`;
    }
    case 'execute_director_action': {
      const actionTitle = (payload as any)?.actionTitle || 'a director action';
      return `Execute director action: ${actionTitle}`;
    }
    default:
      return `Approve ${requestType} action`;
  }
}
