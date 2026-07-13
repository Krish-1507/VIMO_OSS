import crypto from 'crypto';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db';
import { accountSnapshots, connectors, appSettings } from '../db/schema';
import { verifyAccountType } from '../connectors/native/instagramNative';
import * as credentialStore from '../lib/credentialStore';

/**
 * Capture a daily follower snapshot for an Instagram connector.
 * Only inserts one snapshot per day per connector.
 */
export async function captureAccountSnapshot(connectorId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Check if snapshot already exists for today
  const existing = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.connectorId, connectorId),
        eq(accountSnapshots.snapshotDate, today)
      )
    )
    .get();

  if (existing) return;

  // Get the connector and its credentials
  const conn = await db
    .select()
    .from(connectors)
    .where(eq(connectors.id, connectorId))
    .get();

  if (!conn || conn.provider !== 'instagram') return;

  const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
  if (!accessToken) return;

  try {
    const accountData = await verifyAccountType(accessToken);

    await db.insert(accountSnapshots).values({
      id: crypto.randomUUID(),
      connectorId,
      platform: 'instagram',
      followersCount: accountData.followersCount,
      followingCount: 0,
      postsCount: accountData.mediaCount,
      snapshotDate: today,
      createdAt: new Date().toISOString(),
    });

    // Check for follower milestones (100, 500, 1000, 2000, 5000, 10000)
    const milestones = [100, 500, 1000, 2000, 5000, 10000];
    if (milestones.includes(accountData.followersCount)) {
      try {
        const { notifyFollowerMilestone } = await import('./notificationService');
        await notifyFollowerMilestone(accountData.followersCount);
      } catch { /* notification may not be available */ }

      // Record follower_milestone to marketing memory
      try {
        const { recordMemoryEntry } = await import('./memoryTimelineService');
        await recordMemoryEntry({
          brandProfileId: conn.configJson ? (JSON.parse(conn.configJson)?.brandProfileId || '') : '',
          entryType: 'follower_milestone',
          entryDate: new Date().toISOString(),
          weekLabel: '',
          summary: `Reached ${accountData.followersCount} followers!`,
          metrics: { followersCount: accountData.followersCount },
          sentiment: 'positive',
          tags: ['milestone', 'follower', `follower_${accountData.followersCount}`],
          linkedEntityId: connectorId,
          linkedEntityType: 'connector',
          lessonsJson: null,
        });
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn(
      `[AccountSnapshot] Failed to capture for connector ${connectorId}:`,
      (err as Error).message
    );
  }
}

/**
 * Capture snapshots for all active Instagram connectors.
 */
export async function captureAllAccountSnapshots(): Promise<void> {
  const activeInstagramConnectors = await db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.provider, 'instagram'),
        eq(connectors.status, 'active')
      )
    )
    .all();

  for (const conn of activeInstagramConnectors) {
    await captureAccountSnapshot(conn.id);
  }
}

/**
 * Get follower growth data for a connector over the specified number of days.
 */
export async function getFollowerGrowth(
  connectorId: string,
  days: number
): Promise<{
  currentFollowers: number;
  change: number;
  changePercent: number;
  dailyData: Array<{ date: string; followers: number }>;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const snapshots = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.connectorId, connectorId),
        gte(accountSnapshots.snapshotDate, cutoffStr)
      )
    )
    .orderBy(accountSnapshots.snapshotDate)
    .all();

  if (snapshots.length === 0) {
    return {
      currentFollowers: 0,
      change: 0,
      changePercent: 0,
      dailyData: [],
    };
  }

  const currentFollowers = snapshots[snapshots.length - 1].followersCount;
  const firstFollowers = snapshots[0].followersCount;
  const change = currentFollowers - firstFollowers;
  const changePercent = firstFollowers > 0 ? (change / firstFollowers) * 100 : 0;

  const dailyData = snapshots.map((s) => ({
    date: s.snapshotDate,
    followers: s.followersCount,
  }));

  return {
    currentFollowers,
    change,
    changePercent: Math.round(changePercent * 100) / 100,
    dailyData,
  };
}
