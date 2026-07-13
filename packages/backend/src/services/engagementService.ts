import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { engagementQueue } from '../db/schema';
import { sanitizeUserInput } from '../lib/promptSanitizer';
import { generateReply as agentGenerateReply } from '../agents/engagementAgent';
import * as instagramHandler from '../connectors/native/instagramNative';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { io } from '../index';

export interface EngagementItem {
  id: string;
  brandProfileId: string;
  platform: string;
  externalPostId: string;
  authorName: string;
  authorHandle?: string | null;
  content: string;
  type: string;
  status: string;
  replyStatus?: string | null;
  postId?: string | null;
  receivedAt?: string | null;
  replyContent?: string | null;
  confidenceScore?: number | null;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EngagementStats {
  repliedToday: number;
  pending: number;
  purchaseEnquiries: number;
  autoReplied: number;
}

export async function getEngagementQueue(brandProfileId?: string): Promise<EngagementItem[]> {
  const query = db.select().from(engagementQueue);

  if (brandProfileId) {
    return query
      .where(eq(engagementQueue.brandProfileId, brandProfileId))
      .orderBy(desc(engagementQueue.createdAt))
      .all();
  }

  return query.orderBy(desc(engagementQueue.createdAt)).all();
}

export async function getEngagementStats(): Promise<EngagementStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Use targeted SQL queries where possible; purchase intent needs JSON parse in JS
  const all = db.select().from(engagementQueue).all();

  const repliedToday = all.filter(
    (item) => item.status === 'replied' && item.updatedAt >= todayStr
  ).length;

  const pending = all.filter(
    (item) =>
      item.replyStatus === 'pending_review' ||
      item.replyStatus === 'pending_ai_generation' ||
      (!item.replyStatus && item.status === 'pending')
  ).length;

  const purchaseEnquiries = all.filter((item) => {
    if (!item.metadataJson) return false;
    try {
      const meta = JSON.parse(item.metadataJson);
      return meta.intent === 'purchase_intent';
    } catch {
      return false;
    }
  }).length;

  const autoReplied = all.filter(
    (item) => item.replyStatus === 'auto_replied'
  ).length;

  return { repliedToday, pending, purchaseEnquiries, autoReplied };
}

export async function generateReply(itemId: string): Promise<{ reply: string; confidence: number }> {
  const item = db
    .select()
    .from(engagementQueue)
    .where(eq(engagementQueue.id, itemId))
    .get();

  if (!item) {
    throw new Error('Engagement item not found');
  }

  // Use the new intent-aware agent
  const result = await agentGenerateReply(
    item.content,
    item.authorHandle || item.authorName,
    item.brandProfileId
  );

  // Determine reply status based on intent
  let replyStatus = 'pending_review';
  if (result.intent === 'spam') {
    replyStatus = 'spam_detected';
  } else if (result.intent === 'purchase_intent') {
    replyStatus = 'high_priority_review';
  }

  const metadata = {
    intent: result.intent,
    sentiment: result.sentiment,
    alertUser: result.alertUser,
  };

  db.update(engagementQueue)
    .set({
      replyContent: result.reply || null,
      confidenceScore: result.confidence,
      replyStatus,
      metadataJson: JSON.stringify(metadata),
      status: result.intent === 'spam' ? 'ignored' : 'pending',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(engagementQueue.id, itemId))
    .run();

  if (result.intent === 'purchase_intent') {
    io.emit('engagement:purchase_intent', {
      id: item.id,
      authorHandle: item.authorHandle,
      content: item.content,
      intent: 'purchase_intent',
    });
  }

  return { reply: result.reply, confidence: result.confidence };
}

export async function approveReply(itemId: string): Promise<void> {
  const item = db
    .select()
    .from(engagementQueue)
    .where(eq(engagementQueue.id, itemId))
    .get();

  if (!item) throw new Error('Engagement item not found');

  // If this is an Instagram comment, try to post the reply via the API
  if (item.platform === 'instagram' && item.replyContent) {
    try {
      const registry = new ConnectorRegistry(db);
      const allConnectors = await registry.getAll();
      const instagramConnector = allConnectors.find(
        (c) => c.provider === 'instagram' && c.status === 'active'
      );

      if (instagramConnector) {
        const accessToken = await credentialStore.getCredential(instagramConnector.id, 'accessToken');
        if (accessToken) {
          const { replyId } = await instagramHandler.replyToComment({
            commentId: item.externalPostId,
            replyText: item.replyContent,
            accessToken,
          });

          const existingMeta = item.metadataJson ? JSON.parse(item.metadataJson) : {};
          db.update(engagementQueue)
            .set({
              replyStatus: 'auto_replied',
              status: 'replied',
              metadataJson: JSON.stringify({ ...existingMeta, replyId }),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(engagementQueue.id, itemId))
            .run();
          return;
        }
      }
    } catch (err) {
      console.error('[EngagementService] Failed to post reply via API:', err);
      // Fall through to local status update
    }
  }

  // Fallback: just mark as replied locally
  db.update(engagementQueue)
    .set({
      status: 'replied',
      replyStatus: 'auto_replied',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(engagementQueue.id, itemId))
    .run();
}

export async function editAndReply(itemId: string, replyText: string): Promise<void> {
  const item = db
    .select()
    .from(engagementQueue)
    .where(eq(engagementQueue.id, itemId))
    .get();

  if (!item) throw new Error('Engagement item not found');

  const sanitizedReply = sanitizeUserInput(replyText);

  db.update(engagementQueue)
    .set({
      replyContent: sanitizedReply,
      replyStatus: 'pending_review',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(engagementQueue.id, itemId))
    .run();
}

export async function hideEngagementComment(itemId: string): Promise<void> {
  const item = db
    .select()
    .from(engagementQueue)
    .where(eq(engagementQueue.id, itemId))
    .get();

  if (!item) throw new Error('Engagement item not found');

  // Try to hide on Instagram
  if (item.platform === 'instagram') {
    try {
      const registry = new ConnectorRegistry(db);
      const allConnectors = await registry.getAll();
      const instagramConnector = allConnectors.find(
        (c) => c.provider === 'instagram' && c.status === 'active'
      );

      if (instagramConnector) {
        const accessToken = await credentialStore.getCredential(instagramConnector.id, 'accessToken');
        if (accessToken) {
          await instagramHandler.hideComment({
            commentId: item.externalPostId,
            accessToken,
            hide: true,
          });
        }
      }
    } catch (err) {
      console.error('[EngagementService] Failed to hide comment via API:', err);
    }
  }

  db.update(engagementQueue)
    .set({
      replyStatus: 'spam_detected',
      status: 'ignored',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(engagementQueue.id, itemId))
    .run();
}

export async function skipEngagementItem(itemId: string): Promise<void> {
  db.update(engagementQueue)
    .set({
      replyStatus: 'skipped',
      status: 'ignored',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(engagementQueue.id, itemId))
    .run();
}
