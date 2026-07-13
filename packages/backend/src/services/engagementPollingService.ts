/**
 * Engagement Polling Service
 *
 * Polls connected Instagram accounts for new comments and feeds them
 * into the engagement queue. Runs the full engagement pipeline:
 * fetch → classify → generate reply → auto-reply (if enabled).
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { engagementQueue, appSettings } from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import * as instagramHandler from '../connectors/native/instagramNative';
import { generateReply } from '../agents/engagementAgent';
import { io } from '../index';
import { requestApproval } from './approvalService';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSetting(key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

/* ------------------------------------------------------------------ */
/*  pollInstagramComments                                              */
/* ------------------------------------------------------------------ */

export async function pollInstagramComments(connectorId: string): Promise<{
  newCount: number;
  totalChecked: number;
}> {
  const registry = new ConnectorRegistry(db);
  const connector = await registry.getById(connectorId);
  if (!connector) {
    console.error(`[EngagementPoll] Connector ${connectorId} not found`);
    return { newCount: 0, totalChecked: 0 };
  }

  const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
  const instagramAccountId = await credentialStore.getCredential(connectorId, 'instagramAccountId');

  if (!accessToken || !instagramAccountId) {
    console.error(`[EngagementPoll] Missing credentials for connector ${connectorId}`);
    return { newCount: 0, totalChecked: 0 };
  }

  // Read lastPolledAt from appSettings
  const lastPolledKey = `ig_last_polled_${connectorId}`;
  const lastPolledStr = getSetting(lastPolledKey);
  const sinceTimestamp = lastPolledStr ? new Date(lastPolledStr).getTime() : undefined;

  // Fetch recent comments from Instagram
  const comments = await instagramHandler.fetchRecentComments({
    instagramAccountId,
    accessToken,
    sinceTimestamp,
  });

  // Resolve brandProfileId from connector config
  const brandProfileId = (connector.config as Record<string, unknown>)?.brandProfileId as string || '';

  let newCount = 0;

  for (const comment of comments) {
    // Check if already in queue
    const existing = db
      .select()
      .from(engagementQueue)
      .where(eq(engagementQueue.externalPostId, comment.commentId))
      .get();

    if (existing) continue;

    // Insert new engagement item
    await db.insert(engagementQueue).values({
      id: crypto.randomUUID(),
      brandProfileId,
      platform: 'instagram',
      externalPostId: comment.commentId,
      authorName: comment.username,
      authorHandle: `@${comment.username}`,
      content: comment.text,
      type: comment.isReply ? 'reply' : 'comment',
      status: 'pending',
      replyStatus: 'pending_ai_generation',
      postId: comment.postId,
      receivedAt: comment.timestamp,
      metadataJson: JSON.stringify({
        isReply: comment.isReply,
        parentCommentId: comment.parentCommentId,
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    newCount++;
  }

  // Update lastPolledAt
  setSetting(lastPolledKey, new Date().toISOString());

  // Emit socket event with count of new items
  if (newCount > 0) {
    io.emit('engagement:new_comments', {
      connectorId,
      newCount,
      totalChecked: comments.length,
      timestamp: new Date().toISOString(),
    });
  }

  return { newCount, totalChecked: comments.length };
}

/* ------------------------------------------------------------------ */
/*  runEngagementPipeline                                              */
/* ------------------------------------------------------------------ */

export interface PipelineResult {
  totalChecked: number;
  newItems: number;
  classified: number;
  autoReplied: number;
  highPriority: number;
  spamDetected: number;
}

export async function runEngagementPipeline(connectorId: string): Promise<PipelineResult> {
  const result: PipelineResult = {
    totalChecked: 0,
    newItems: 0,
    classified: 0,
    autoReplied: 0,
    highPriority: 0,
    spamDetected: 0,
  };

  try {
    // Step 1: Poll for new comments
    const pollResult = await pollInstagramComments(connectorId);
    result.totalChecked = pollResult.totalChecked;
    result.newItems = pollResult.newCount;

    // Step 2: Get all items with replyStatus='pending_ai_generation'
    const pendingItems = db
      .select()
      .from(engagementQueue)
      .where(eq(engagementQueue.replyStatus, 'pending_ai_generation'))
      .all();

    // Step 3: For each item, classify sentiment and generate reply
    for (const item of pendingItems) {
      try {
        const replyResult = await generateReply(
          item.content,
          item.authorHandle || item.authorName,
          item.brandProfileId
        );

        const metadata = {
          intent: replyResult.intent,
          sentiment: replyResult.sentiment,
          intentConfidence: replyResult.confidence,
        };

        // Route based on intent
        if (replyResult.intent === 'spam') {
          // Step for spam: hide comment and mark
          await db
            .update(engagementQueue)
            .set({
              replyStatus: 'spam_detected',
              status: 'ignored',
              metadataJson: JSON.stringify(metadata),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(engagementQueue.id, item.id))
            .run();

          // Try to hide the comment on Instagram
          try {
            const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
            if (accessToken) {
              await instagramHandler.hideComment({
                commentId: item.externalPostId,
                accessToken,
                hide: true,
              });
            }
          } catch (hideErr) {
            console.error(`[EngagementPipeline] Failed to hide spam comment ${item.externalPostId}:`, hideErr);
          }

          result.spamDetected++;
        } else if (replyResult.intent === 'purchase_intent') {
          // High priority: purchase intent
          await db
            .update(engagementQueue)
            .set({
              replyStatus: 'high_priority_review',
              replyContent: replyResult.reply,
              confidenceScore: replyResult.confidence,
              metadataJson: JSON.stringify({ ...metadata, alertUser: replyResult.alertUser }),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(engagementQueue.id, item.id))
            .run();

          // Emit socket event immediately
          io.emit('engagement:purchase_intent', {
            id: item.id,
            authorHandle: item.authorHandle,
            content: item.content,
            intent: replyResult.intent,
          });

          // Send purchase intent notification
          try {
            const { notifyPurchaseIntent } = await import('./notificationService');
            await notifyPurchaseIntent(item.authorHandle?.replace('@', '') || item.authorName);
          } catch { /* notification may not be available */ }

          result.highPriority++;
        } else {
          // Normal flow: check auto-reply setting
          const autoReplyEnabled = getSetting('engagement_auto_reply') === 'true';
          const autoReplyThreshold = parseInt(getSetting('engagement_auto_reply_threshold') || '75', 10);

          if (autoReplyEnabled && replyResult.confidence >= autoReplyThreshold) {
            // Auto-approve and reply
            await db
              .update(engagementQueue)
              .set({
                replyStatus: 'auto_approved',
                replyContent: replyResult.reply,
                confidenceScore: replyResult.confidence,
                metadataJson: JSON.stringify(metadata),
                updatedAt: new Date().toISOString(),
              })
              .where(eq(engagementQueue.id, item.id))
              .run();
          } else {
            // Send for human review
            await db
              .update(engagementQueue)
              .set({
                replyStatus: 'pending_review',
                replyContent: replyResult.reply,
                confidenceScore: replyResult.confidence,
                metadataJson: JSON.stringify(metadata),
                updatedAt: new Date().toISOString(),
              })
              .where(eq(engagementQueue.id, item.id))
              .run();
          }
        }

        result.classified++;
      } catch (itemErr) {
        console.error(`[EngagementPipeline] Failed to process item ${item.id}:`, itemErr);
      }
    }

    // Step 4: Get all items with replyStatus='auto_approved' and auto-reply them
    const autoApprovedItems = db
      .select()
      .from(engagementQueue)
      .where(eq(engagementQueue.replyStatus, 'auto_approved'))
      .all();

    const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');

    for (const item of autoApprovedItems) {
      if (!accessToken || !item.replyContent) continue;

      // Check approval before replying
      try {
        const approvalResult = await requestApproval({
          requestType: 'send_reply',
          payload: {
            engagementItemId: item.id,
            commentId: item.externalPostId,
            replyText: item.replyContent,
            accessToken,
            authorName: item.authorHandle || item.authorName,
            confidence: item.confidenceScore || 0,
            brandProfileId: item.brandProfileId,
          },
          brandProfileId: item.brandProfileId,
          requestedBy: 'engagement_pipeline',
          urgency: 'immediate',
        });

        if (approvalResult.decision !== 'approved') {
          // Revert to pending_review so user can handle manually
          await db
            .update(engagementQueue)
            .set({
              replyStatus: 'pending_review',
              metadataJson: JSON.stringify({
                ...(item.metadataJson ? JSON.parse(item.metadataJson) : {}),
                approvalRequestId: approvalResult.approvalRequestId,
              }),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(engagementQueue.id, item.id))
            .run();
          continue;
        }
      } catch {
        // If approval service fails, proceed with existing logic
      }

      try {
        const { replyId } = await instagramHandler.replyToComment({
          commentId: item.externalPostId,
          replyText: item.replyContent,
          accessToken,
        });

        const existingMetadata = item.metadataJson ? JSON.parse(item.metadataJson) : {};
        await db
          .update(engagementQueue)
          .set({
            replyStatus: 'auto_replied',
            status: 'replied',
            metadataJson: JSON.stringify({ ...existingMetadata, replyId }),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(engagementQueue.id, item.id))
          .run();

        result.autoReplied++;
      } catch (replyErr) {
        console.error(`[EngagementPipeline] Failed to auto-reply to ${item.externalPostId}:`, replyErr);
        // Revert to pending_review so user can handle manually
        await db
          .update(engagementQueue)
          .set({
            replyStatus: 'pending_review',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(engagementQueue.id, item.id))
          .run();
      }
    }

    // Step 5: Emit pipeline complete
    io.emit('engagement:pipeline_complete', {
      connectorId,
      ...result,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[EngagementPipeline] Completed for ${connectorId}: ` +
      `checked ${result.totalChecked}, ${result.newItems} new, ` +
      `${result.autoReplied} auto-replied, ${result.spamDetected} spam, ` +
      `${result.highPriority} high-priority`
    );
  } catch (err) {
    console.error(`[EngagementPipeline] Error for connector ${connectorId}:`, err);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  runEngagementPipelineForAllConnectors                              */
/* ------------------------------------------------------------------ */

export async function runEngagementPipelineForAllConnectors(): Promise<void> {
  const registry = new ConnectorRegistry(db);
  const allConnectors = await registry.getAll();

  const instagramConnectors = allConnectors.filter(
    (c) => c.provider === 'instagram' && c.status === 'active'
  );

  for (const connector of instagramConnectors) {
    await runEngagementPipeline(connector.id);
  }
}
