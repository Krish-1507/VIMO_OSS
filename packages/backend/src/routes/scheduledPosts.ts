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
import { rewriteCaption, translateCaption } from '../services/captionHelperService';
import { brandProfiles } from '../db/schema';
import { formatError } from '../lib/errorFormatter';

/**
 * Normalize any client-supplied date to ISO-8601 UTC.
 *
 * The scheduler compares stored timestamps, so the column must hold one format.
 * Naive strings from `<input type="datetime-local">` ("2026-08-22T14:30") are
 * parsed as the user's local wall-clock time (per the JS Date spec) and stored
 * as UTC — exactly what the user picked. Returns null when unparseable so the
 * caller can reject the request instead of writing garbage.
 */
function toISODate(value: string): string | null {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

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
        socialAccountId?: string;
      };

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const scheduledAtISO = toISODate(body.scheduledAt);
      if (!scheduledAtISO) {
        return reply.status(400).send({
          error: 'scheduledAt must be a valid date (for example 2026-08-22T14:30)',
        });
      }

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
        scheduledAt: scheduledAtISO,
        status: 'pending' as const,
        socialAccountId: body.socialAccountId || null,
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
    const scheduledAtISO = body.scheduledAt ? toISODate(body.scheduledAt) : undefined;
    if (body.scheduledAt && !scheduledAtISO) {
      return reply.status(400).send({
        error: 'scheduledAt must be a valid date (for example 2026-08-22T14:30)',
      });
    }

    if (scheduledAtISO && scheduledAtISO !== existing.scheduledAt) {
      await schedulerService.reschedulePost(id, scheduledAtISO);
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

  // POST /api/scheduled-posts/caption-helper
  app.post('/api/scheduled-posts/caption-helper', async (request, reply) => {
    try {
      const { content, tone, platform, brandProfileId } = request.body as {
        content: string;
        tone: string;
        platform?: string;
        brandProfileId?: string;
      };

      if (!content || !content.trim()) {
        return reply.status(400).send({ error: 'content is required' });
      }
      if (!tone || !tone.trim()) {
        return reply.status(400).send({ error: 'tone is required' });
      }

      const rewritten = await rewriteCaption({
        content,
        tone,
        platform,
        brandProfileId,
      });
      return { content: rewritten };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/scheduled-posts/translate
  app.post('/api/scheduled-posts/translate', async (request, reply) => {
    try {
      const { content, targetLanguage, platform } = request.body as {
        content: string;
        targetLanguage: string;
        platform?: string;
      };

      if (!content || !content.trim()) {
        return reply.status(400).send({ error: 'content is required' });
      }
      if (!targetLanguage || !targetLanguage.trim()) {
        return reply.status(400).send({ error: 'targetLanguage is required' });
      }

      const translated = await translateCaption({
        content,
        targetLanguage,
        platform,
      });
      return { content: translated };
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
