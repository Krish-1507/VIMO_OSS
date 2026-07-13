import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { io } from '../index';
import crypto from 'crypto';

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'campaign_complete'
  | 'engagement_spike'
  | 'connector_error'
  | 'purchase_intent'
  | 'follower_milestone';

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}

/**
 * Create a notification and emit it via socket.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const notification = {
    id,
    type: params.type,
    title: params.title,
    message: params.message,
    isRead: 'false',
    actionUrl: params.actionUrl || null,
    createdAt: now,
  };

  try {
    await db.insert(notifications).values(notification).run();
    io.emit('notification:new', notification);
  } catch (err) {
    console.error('[Notification] Failed to create notification:', (err as Error).message);
  }
}

/**
 * Get unread notifications count.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const all = await db.select().from(notifications).where(eq(notifications.isRead, 'false')).all();
    return all.length;
  } catch {
    return 0;
  }
}

/**
 * Get recent notifications (last 10).
 */
export async function getRecentNotifications(limit = 10): Promise<typeof notifications.$inferSelect[]> {
  try {
    return await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .all();
  } catch {
    return [];
  }
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(): Promise<void> {
  try {
    const all = await db.select().from(notifications).where(eq(notifications.isRead, 'false')).all();
    for (const n of all) {
      await db.update(notifications).set({ isRead: 'true' }).where(eq(notifications.id, n.id)).run();
    }
  } catch (err) {
    console.error('[Notification] Failed to mark all as read:', (err as Error).message);
  }
}

/**
 * Trigger specific notification types
 */
export async function notifyPostPublished(content: string, platform: string): Promise<void> {
  await createNotification({
    type: 'post_published',
    title: `✅ Posted to ${platform}`,
    message: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
    actionUrl: '/scheduler',
  });
}

export async function notifyPostFailed(error: string): Promise<void> {
  await createNotification({
    type: 'post_failed',
    title: '❌ Post failed',
    message: error,
    actionUrl: '/scheduler',
  });
}

export async function notifyCampaignComplete(campaignName: string): Promise<void> {
  await createNotification({
    type: 'campaign_complete',
    title: '🎉 Campaign finished',
    message: `${campaignName} is done. View results.`,
    actionUrl: '/campaigns',
  });
}

export async function notifyEngagementSpike(postPreview: string): Promise<void> {
  await createNotification({
    type: 'engagement_spike',
    title: '🔥 Engagement spike',
    message: `"${postPreview.slice(0, 40)}..." is getting a lot of attention.`,
    actionUrl: '/engagement',
  });
}

export async function notifyPurchaseIntent(username: string): Promise<void> {
  await createNotification({
    type: 'purchase_intent',
    title: '💰 Potential sale',
    message: `@${username} asked about pricing.`,
    actionUrl: '/engagement',
  });
}

export async function notifyFollowerMilestone(count: number): Promise<void> {
  await createNotification({
    type: 'follower_milestone',
    title: '🏆 Milestone!',
    message: `You just hit ${count.toLocaleString()} followers!`,
    actionUrl: '/analytics',
  });
}
