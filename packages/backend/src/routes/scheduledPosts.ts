import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import {
  generatePost,
  generateVariants,
  repurposeContent,
  generateABVariants,
} from '../services/contentGenerationService';
import * as schedulerService from '../services/schedulerService';
import { suggestPostingTime } from '../services/postingTimeService';
import { generateHashtagSet, getPostHashtagCount } from '../services/hashtagService';
import { brandProfiles } from '../db/schema';
import { formatError } from '../lib/errorFormatter';

export default async function scheduledPostsRoutes(app: FastifyInstance) {
  // GET /api/scheduled-posts
  app.get('/api/scheduled-posts', async (request, reply) => {
    try {
      const { startDate, endDate, platform, status } = request.query as {
        startDate?: string;
        endDate?: string;
        platform?: string;
        status?: string;
      };

      const whereClauses: any[] = [];

      if (startDate && endDate) {
        whereClauses.push(
          and(
            gte(scheduledPosts.scheduledAt, startDate),
            lte(scheduledPosts.scheduledAt, endDate),
          ),
        );
      }

      if (platform) {
        whereClauses.push(eq(scheduledPosts.platform, platform));
      }

      if (status) {
        whereClauses.push(eq(scheduledPosts.status, status));
      }

      const rows = await (whereClauses.length > 0
        ? db
            .select()
            .from(scheduledPosts)
            .where(and(...(whereClauses as [any, ...any[]])))
        : db.select().from(scheduledPosts)
      ).all();

      return rows.map((row) => ({
        ...row,
        mediaUrls: row.mediaUrlsJson ? JSON.parse(row.mediaUrlsJson) : [],
        metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
      }));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/scheduled-posts/:id
  app.get('/api/scheduled-posts/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const row = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).get();
      if (!row) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      return {
        ...row,
        mediaUrls: row.mediaUrlsJson ? JSON.parse(row.mediaUrlsJson) : [],
        metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/scheduled-posts
  app.post('/api/scheduled-posts', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        platform: string;
        content: string;
        hashtags?: string[];
        scheduledAt: string;
        mediaUrls?: string[];
        campaignId?: string;
      };

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Build metadata including hashtag tiers and content type if provided
      const metadata: Record<string, unknown> = {};
      if (body.hashtags) {
        metadata.hashtags = body.hashtags;
      }
      if ((body as any).hashtagTiers) {
        metadata.hashtagTiers = (body as any).hashtagTiers;
      }
      if ((body as any).contentType) {
        metadata.contentType = (body as any).contentType;
      }

      const postData = {
        id,
        campaignId: body.campaignId || null,
        brandProfileId: body.brandProfileId,
        content: body.content,
        platform: body.platform,
        scheduledAt: body.scheduledAt,
        status: 'pending' as const,
        mediaUrlsJson: body.mediaUrls ? JSON.stringify(body.mediaUrls) : null,
        metadataJson: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(scheduledPosts).values(postData);

      // Add to scheduler queue
      await schedulerService.schedulePost(postData);

      return reply.status(201).send({
        ...postData,
        mediaUrls: body.mediaUrls || [],
        metadata,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // PUT /api/scheduled-posts/:id
  app.put('/api/scheduled-posts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      content?: string;
      scheduledAt?: string;
      mediaUrls?: string[];
      metadata?: Record<string, unknown>;
    };

    const existing = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ error: 'Scheduled post not found' });
    }

    const now = new Date().toISOString();

    if (body.scheduledAt && body.scheduledAt !== existing.scheduledAt) {
      await schedulerService.reschedulePost(id, body.scheduledAt);
    }

    await db
      .update(scheduledPosts)
      .set({
        content: body.content ?? existing.content,
        mediaUrlsJson: body.mediaUrls ? JSON.stringify(body.mediaUrls) : existing.mediaUrlsJson,
        metadataJson: body.metadata ? JSON.stringify(body.metadata) : existing.metadataJson,
        updatedAt: now,
      })
      .where(eq(scheduledPosts.id, id))
      .run();

    return {
      ...existing,
      ...body,
      updatedAt: now,
    };
  });

  // DELETE /api/scheduled-posts/:id
  app.delete('/api/scheduled-posts/:id', async (request) => {
    const { id } = request.params as { id: string };
    await schedulerService.cancelPost(id);
    return { success: true };
  });

  // POST /api/scheduled-posts/generate
  app.post('/api/scheduled-posts/generate', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (request) => {
    const { brandProfileId, platform, topic, additionalContext } = request.body as {
      brandProfileId: string;
      platform: string;
      topic: string;
      additionalContext?: string;
    };

    const result = await generatePost({
      brandProfileId,
      platform,
      topic,
      additionalContext,
    });

    return result;
  });

  // POST /api/scheduled-posts/repurpose
  app.post('/api/scheduled-posts/repurpose', async (request) => {
    const { brandProfileId, sourceContent, sourcePlatform, targetPlatforms } = request.body as {
      brandProfileId: string;
      sourceContent: string;
      sourcePlatform: string;
      targetPlatforms: string[];
    };

    const result = await repurposeContent({
      brandProfileId,
      sourceContent,
      sourcePlatform,
      targetPlatforms,
    });

    return result;
  });

  // POST /api/scheduled-posts/regenerate-hashtags
  app.post('/api/scheduled-posts/regenerate-hashtags', async (request, reply) => {
    try {
      const { topic, brandProfileId, platform, postNumber } = request.body as {
        topic: string;
        brandProfileId: string;
        platform: string;
        postNumber?: number;
      };

      const brandRow = await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
      if (!brandRow) {
        return reply.status(404).send({ error: 'Brand profile not found' });
      }

      const industry = brandRow.industry;
      const brandKeywords = brandRow.toneKeywordsJson ? JSON.parse(brandRow.toneKeywordsJson) as string[] : [];
      const count = postNumber ?? (await getPostHashtagCount(brandProfileId));

      const hashtagSet = await generateHashtagSet({
        topic,
        industry,
        brandKeywords,
        platform: platform as 'instagram' | 'tiktok',
        postNumber: count,
        brandProfileId,
      });

      return hashtagSet;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/scheduled-posts/suggest-time
  app.post('/api/scheduled-posts/suggest-time', async (request, reply) => {
    try {
      const { platform, brandProfileId, connectorId } = request.body as {
        platform: string;
        brandProfileId: string;
        connectorId: string;
      };

      if (!platform || !brandProfileId || !connectorId) {
        return reply.status(400).send({
          error: 'platform, brandProfileId, and connectorId are required',
        });
      }

      const result = await suggestPostingTime(platform, brandProfileId, connectorId);
      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/scheduled-posts/variants
  app.post('/api/scheduled-posts/variants', async (request) => {
    const { brandProfileId, platform, topic } = request.body as {
      brandProfileId: string;
      platform: string;
      topic: string;
    };

    const result = await generateABVariants({
      brandProfileId,
      platform,
      topic,
    });

    return result;
  });
}
