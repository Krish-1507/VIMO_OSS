import { FastifyInstance } from 'fastify';
import { getPostPerformance, generateInsightSummary, getWeeklyReport } from '../services/analyticsService';
import { analyzeTopPerformingContent } from '../services/growthLoopService';
import { getFollowerGrowth } from '../services/accountSnapshotService';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { getEffectiveBrandProfileId } from '../services/brandBrainService';

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/api/analytics/performance', async (request, reply) => {
    try {
      const { startDate, endDate, brandProfileId } = request.query as any;
      if (!startDate || !endDate) {
        return { 
          totalPostsPublished: 0, totalReach: 0, totalEngagements: 0, avgEngagementRate: 0,
          byPlatform: {}, byDayOfWeek: [], byHourOfDay: [], byDate: {} 
        };
      }
      return await getPostPerformance({ start: startDate, end: endDate }, brandProfileId);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/insights', async (request, reply) => {
    try {
      const { startDate, endDate, brandProfileId } = request.query as any;
      if (!startDate || !endDate) {
        return { summary: "Not enough data to generate insights." };
      }
      const data = await getPostPerformance({ start: startDate, end: endDate }, brandProfileId);
      const summary = await generateInsightSummary(data, brandProfileId);
      return { summary };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/weekly-report', async (request, reply) => {
    try {
      const { brandProfileId } = request.query as any;
      return await getWeeklyReport(brandProfileId);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/growth-insights', async (request, reply) => {
    try {
      const { brandProfileId } = request.query as any;
      const effectiveId = await getEffectiveBrandProfileId(brandProfileId);
      return await analyzeTopPerformingContent(effectiveId);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/account-growth', async (request, reply) => {
    try {
      const { connectorId, days } = request.query as { connectorId?: string; days?: string };
      if (!connectorId) {
        return reply.status(400).send({ error: 'connectorId is required' });
      }
      const numDays = parseInt(days || '7', 10);
      return await getFollowerGrowth(connectorId, numDays);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/summary', async (request, reply) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const posts = db.select().from(scheduledPosts)
        .where(gte(scheduledPosts.scheduledAt, thirtyDaysAgo.toISOString()))
        .all();
      const published = posts.filter((p) => p.status === 'published');

      // Pull REAL follower counts from the connected social accounts when available.
      // If nothing is connected we report honest zeros + a flag instead of fake data.
      let totalFollowers = 0;
      let totalReach = 0;
      let totalEngagements = 0;
      const connectedPlatforms: string[] = [];
      const platformDetails: { platform: string; connected: boolean; followers: number; reason?: string }[] = [];
      let hasConnectedAccounts = false;

      try {
        const { vimoSocialPublish } = await import('../services/vimoSocialPublishService');
        const accounts = await vimoSocialPublish.getAccounts();
        const seen = new Set<string>();
        for (const acc of accounts) {
          if (seen.has(acc.platform)) continue;
          seen.add(acc.platform);
          if (acc.isConnected && typeof acc.followerCount === 'number') {
            hasConnectedAccounts = true;
            totalFollowers += acc.followerCount;
            if (!connectedPlatforms.includes(acc.platform)) {
              connectedPlatforms.push(acc.platform);
            }
            platformDetails.push({ platform: acc.platform, connected: true, followers: acc.followerCount });
          } else {
            platformDetails.push({
              platform: acc.platform,
              connected: false,
              followers: 0,
              reason: acc.healthMessage || 'Not connected',
            });
          }
        }
      } catch {
        // Social accounts service unavailable — fall back to post-based stats only.
      }

      // Real engagement from stored post performance over the last 30 days.
      for (const post of published) {
        const meta = post.metadataJson ? JSON.parse(post.metadataJson) : {};
        const perf = meta.performance;
        if (perf && typeof perf.reach === 'number') {
          totalReach += perf.reach ?? 0;
          totalEngagements += (perf.likes ?? 0) + (perf.comments ?? 0) + (perf.saves ?? 0) + (perf.shares ?? 0);
        }
      }

      const avgEngagement = totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;

      return {
        totalFollowers,
        totalPosts: published.length,
        avgEngagement,
        totalReach,
        hasConnectedAccounts,
        connectedPlatforms,
        platforms: platformDetails,
        // Honest data-integrity flag: followers/reach are only "real" when at
        // least one platform is actually connected and reporting numbers.
        dataIntegrity: {
          realFollowers: hasConnectedAccounts,
          note: hasConnectedAccounts
            ? 'Follower counts are pulled live from your connected accounts.'
            : 'No platforms connected — follower and reach numbers are unavailable, not zero.',
        },
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/analytics/upcoming', async (request, reply) => {
    try {
      const { brandProfileId } = request.query as any;
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);

      const conditions = [
        eq(scheduledPosts.status, 'pending'),
        gte(scheduledPosts.scheduledAt, now.toISOString()),
        lte(scheduledPosts.scheduledAt, nextWeek.toISOString())
      ];
      if (brandProfileId) {
        conditions.push(eq(scheduledPosts.brandProfileId, brandProfileId));
      }

      const upcoming = await db.select().from(scheduledPosts).where(and(...conditions)).all();
      return upcoming;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
