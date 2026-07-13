/**
 * Performance Tracker Service
 *
 * Fetches real Instagram post insights and stores them in the post metadata.
 * Runs periodically via node-cron to keep metrics up to date.
 */
import axios from 'axios';
import { eq, and, gte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { io } from '../index';

interface PostInsights {
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
  saves: number;
  shares: number;
  engagementRate: number;
}

/**
 * Fetches post insights from Instagram Graph API
 */
export async function fetchInstagramPostInsights(
  platformPostId: string,
  accessToken: string
): Promise<PostInsights> {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${platformPostId}/insights`,
    {
      params: {
        metric: 'likes,comments,reach,impressions,saved,shares',
        access_token: accessToken,
      },
    }
  );

  const data = res.data?.data ?? [];
  const metrics: Record<string, number> = { likes: 0, comments: 0, reach: 0, impressions: 0, saves: 0, shares: 0 };

  for (const metric of data) {
    const name = metric.name as string;
    const value = metric.values?.[0]?.value;
    if (name && typeof value === 'number') {
      metrics[name] = value;
    }
  }

  const { likes, comments, reach, impressions, saves, shares } = metrics;
  const engagementRate = reach > 0 ? ((likes + comments + saves + shares) / reach) * 100 : 0;

  return {
    likes,
    comments,
    reach,
    impressions,
    saves,
    shares,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

/**
 * Refreshes performance data for all published Instagram posts from the last 30 days.
 * Called periodically by node-cron.
 */
export async function refreshPostPerformance(): Promise<void> {
  console.log('[PerformanceTracker] Starting scheduled post performance refresh...');

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.status, 'published'),
          eq(scheduledPosts.platform, 'instagram'),
          gte(scheduledPosts.scheduledAt, thirtyDaysAgo)
        )
      )
      .all();

    if (posts.length === 0) {
      console.log('[PerformanceTracker] No Instagram posts to refresh.');
      return;
    }

    // Find the active Instagram connector for the access token
    const registry = new ConnectorRegistry(db);
    const allConnectors = await registry.getAll();
    const instagramConnector = allConnectors.find(
      (c) => c.provider === 'instagram' && c.status === 'active'
    );

    if (!instagramConnector) {
      console.log('[PerformanceTracker] No active Instagram connector found. Skipping refresh.');
      return;
    }

    const accessToken = await credentialStore.getCredential(instagramConnector.id, 'accessToken');
    if (!accessToken) {
      console.log('[PerformanceTracker] No Instagram access token found. Skipping refresh.');
      return;
    }

    let updatedCount = 0;
    let spikedPostPreview = '';

    for (const post of posts) {
      const metadata = post.metadataJson ? JSON.parse(post.metadataJson) : {};
      const platformPostId = metadata.platformPostId;

      if (!platformPostId) {
        continue;
      }

      try {
        const insights = await fetchInstagramPostInsights(platformPostId, accessToken);

        const updatedMetadata = {
          ...metadata,
          performance: {
            ...(metadata.performance || {}),
            lastRefreshed: new Date().toISOString(),
            ...insights,
          },
        };

        await db
          .update(scheduledPosts)
          .set({
            metadataJson: JSON.stringify(updatedMetadata),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, post.id))
          .run();

        updatedCount++;

        // Check for engagement spike: 5+ comments in recent performance
        if (insights.comments >= 5 && !spikedPostPreview) {
          spikedPostPreview = post.content.substring(0, 50);
        }
      } catch (err) {
        console.warn(
          `[PerformanceTracker] Failed to fetch insights for post ${post.id} (platformPostId: ${platformPostId}):`,
          (err as Error).message
        );
      }
    }

    console.log(`[PerformanceTracker] Refreshed performance data for ${updatedCount}/${posts.length} posts.`);

    // Send engagement spike notification if detected
    if (spikedPostPreview) {
      try {
        const { notifyEngagementSpike } = await import('./notificationService');
        await notifyEngagementSpike(spikedPostPreview);
      } catch { /* notification may not be available */ }
    }

    // Notify connected clients
    io.emit('analytics:updated', {
      refreshedAt: new Date().toISOString(),
      postCount: updatedCount,
    });
  } catch (err) {
    console.error('[PerformanceTracker] Error during performance refresh:', err);
  }
}
