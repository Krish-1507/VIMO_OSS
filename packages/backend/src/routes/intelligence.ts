/**
 * Intelligence Routes
 *
 * GET    /api/intelligence/signals              — list non-expired trend_signals
 * POST   /api/intelligence/signals/:id/create-content — mark signal as acted on
 * GET    /api/intelligence/competitors           — list competitor profiles with latest snapshots
 * POST   /api/intelligence/competitors           — create a competitor profile
 * DELETE /api/intelligence/competitors/:id        — remove a competitor profile
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { buildTimeline } from '../services/marketingTimeMachineService';
import { db } from '../db';
import { trendSignals, competitorProfiles, competitorSnapshots } from '../db/schema';
import { formatError } from '../lib/errorFormatter';

export default async function intelligenceRoutes(app: FastifyInstance) {
  // POST /api/intelligence/time-machine — build a marketing timeline
  app.post('/api/intelligence/time-machine', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        question: string;
      };

      if (!body.brandProfileId || !body.question) {
        return reply.status(400).send({ error: 'brandProfileId and question are required' });
      }

      const result = await buildTimeline({
        brandProfileId: body.brandProfileId,
        question: body.question,
      });

      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });


  // GET /api/intelligence/signals — returns all non-expired trend_signals
  app.get('/api/intelligence/signals', async (request, reply) => {
    try {
      const { signalType } = request.query as { signalType?: string };

      const now = new Date().toISOString();

      // Fetch all non-expired signals and filter in JS for signalType
      // (using .all() directly to avoid drizzle chain type issues)
      let signals = db
        .select()
        .from(trendSignals)
        .where(gte(trendSignals.expiresAt, now))
        .orderBy(desc(trendSignals.relevanceScore))
        .all();

      if (signalType) {
        signals = signals.filter((s: any) => s.signalType === signalType);
      }

      return signals;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/intelligence/signals/:id/create-content — marks signal as acted on
  app.post('/api/intelligence/signals/:id/create-content', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const signal = db
        .select()
        .from(trendSignals)
        .where(eq(trendSignals.id, id))
        .get();

      if (!signal) {
        return reply.status(404).send({ error: 'Signal not found' });
      }

      // Mark as acted on
      db.update(trendSignals)
        .set({ isActedOn: 1 })
        .where(eq(trendSignals.id, id))
        .run();

      // Record trend_capitalized to marketing memory
      try {
        const { recordMemoryEntry } = await import('../services/memoryTimelineService');
        await recordMemoryEntry({
          brandProfileId: (request.body as any)?.brandProfileId || signal.id || '',
          entryType: 'trend_capitalized',
          entryDate: new Date().toISOString(),
          weekLabel: '',
          summary: `Capitalized on trend: ${signal.title}`,
          metrics: { signalType: signal.signalType, relevanceScore: signal.relevanceScore },
          sentiment: 'positive',
          tags: ['trend', signal.signalType],
          linkedEntityId: id,
          linkedEntityType: 'trend_signal',
          lessonsJson: null,
        });
      } catch { /* ignore */ }

      return {
        success: true,
        signal,
        // Return a pre-filled content brief for navigation to Content Studio
        contentBrief: {
          topic: signal.title,
          additionalContext: signal.actionSuggestion || signal.description,
        },
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/intelligence/competitors — returns all competitor_profiles with latest snapshot
  app.get('/api/intelligence/competitors', async (request, reply) => {
    try {
      const profiles = db.select().from(competitorProfiles).all();

      // Enrich with latest snapshot
      const enriched = profiles.map((profile) => {
        const latestSnapshot = db
          .select()
          .from(competitorSnapshots)
          .where(eq(competitorSnapshots.competitorProfileId, profile.id))
          .orderBy(desc(competitorSnapshots.createdAt))
          .all()[0] || null;

        return {
          ...profile,
          latestSnapshot,
        };
      });

      return enriched;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/intelligence/competitors — create a competitor profile
  app.post('/api/intelligence/competitors', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId?: string;
        competitorName: string;
        platformHandle: string;
        platform: string;
      };

      if (!body.competitorName || !body.platformHandle || !body.platform) {
        return reply.status(400).send({
          error: 'competitorName, platformHandle, and platform are required',
        });
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      await db.insert(competitorProfiles).values({
        id,
        brandProfileId: body.brandProfileId || '',
        competitorName: body.competitorName,
        platformHandle: body.platformHandle,
        platform: body.platform,
        followersCount: null,
        lastCheckedAt: null,
        createdAt: now,
      });

      return reply.status(201).send({
        id,
        brandProfileId: body.brandProfileId || '',
        competitorName: body.competitorName,
        platformHandle: body.platformHandle,
        platform: body.platform,
        followersCount: null,
        lastCheckedAt: null,
        createdAt: now,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/intelligence/competitors/:id — remove a competitor profile
  app.delete('/api/intelligence/competitors/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = db
        .select()
        .from(competitorProfiles)
        .where(eq(competitorProfiles.id, id))
        .get();

      if (!existing) {
        return reply.status(404).send({ error: 'Competitor profile not found' });
      }

      // Delete associated snapshots
      db.delete(competitorSnapshots)
        .where(eq(competitorSnapshots.competitorProfileId, id))
        .run();

      // Delete the profile
      db.delete(competitorProfiles)
        .where(eq(competitorProfiles.id, id))
        .run();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
