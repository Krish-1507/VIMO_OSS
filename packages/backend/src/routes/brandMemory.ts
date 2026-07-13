/**
 * Brand Memory Routes
 *
 * GET  /api/brand-memory/:brandProfileId — returns the full brand memory state
 * POST /api/brand-memory/:brandProfileId/refresh-dna — calls updateContentDNA immediately
 * POST /api/brand-memory/:brandProfileId/add-audience-insight — adds an audience insight
 * GET  /api/brand-memory/:brandProfileId/adaptive-plan — returns the current AdaptivePlan
 * POST /api/brand-memory/:brandProfileId/adaptive-plan/toggle-rule — toggles a single rule
 * POST /api/brand-memory/:brandProfileId/adaptive-plan/refresh — derive rules now
 */

import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import {
  updateContentDNA,
  addAudienceInsight,
  getBrandContext,
} from '../services/brandMemoryService';
import {
  getAdaptivePlan,
  toggleBehaviorRule,
  deriveBehaviorRules,
} from '../lib/adaptivePlanning';

export default async function brandMemoryRoutes(app: FastifyInstance) {
  // GET /api/brand-memory/:brandProfileId — returns full brand memory
  app.get('/api/brand-memory/:brandProfileId', async (request, reply) => {
    try {
      const { brandProfileId } = request.params as { brandProfileId: string };

      const row = await db
        .select()
        .from(brandProfiles)
        .where(eq(brandProfiles.id, brandProfileId))
        .get();

      if (!row) {
        return reply.status(404).send({ error: 'Brand profile not found' });
      }

      // Parse all JSON fields
      const parse = (v: string | null | undefined) => {
        if (!v) return null;
        try { return JSON.parse(v); } catch { return v; }
      };

      return {
        id: row.id,
        name: row.name,
        industry: row.industry,
        audience: row.audience,
        memoryVersion: row.memoryVersion || 1,
        totalPostsGenerated: row.totalPostsGenerated || 0,
        totalCampaignsRun: row.totalCampaignsRun || 0,
        performanceLessons: parse(row.performanceLessons),
        audienceInsights: parse(row.audienceInsights),
        campaignMemory: parse(row.campaignMemory),
        contentDNA: parse(row.contentDNA),
        adaptivePlan: parse(row.adaptivePlan),
        voiceFingerprint: parse(row.voiceFingerprint),
        updatedAt: row.updatedAt,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/brand-memory/:brandProfileId/refresh-dna — refreshes content DNA
  app.post('/api/brand-memory/:brandProfileId/refresh-dna', async (request, reply) => {
    try {
      const { brandProfileId } = request.params as { brandProfileId: string };

      await updateContentDNA(brandProfileId);

      return {
        success: true,
        message: 'Content DNA refreshed successfully.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/brand-memory/:brandProfileId/add-audience-insight — adds a new audience insight
  app.post('/api/brand-memory/:brandProfileId/add-audience-insight', async (request, reply) => {
    try {
      const { brandProfileId } = request.params as { brandProfileId: string };
      const body = request.body as {
        segment: string;
        contentTheyEngageWith: string;
        bestTimeToReach: string;
        estimatedSize: string;
      };

      if (!body.segment) {
        return reply.status(400).send({ error: 'segment is required' });
      }

      await addAudienceInsight(brandProfileId, {
        segment: body.segment,
        contentTheyEngageWith: body.contentTheyEngageWith || '',
        bestTimeToReach: body.bestTimeToReach || '',
        estimatedSize: body.estimatedSize || '',
      });

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/brand-memory/:brandProfileId/adaptive-plan — returns current AdaptivePlan
  app.get('/api/brand-memory/:brandProfileId/adaptive-plan', async (request, reply) => {
    try {
      const { brandProfileId } = request.params as { brandProfileId: string };

      const plan = await getAdaptivePlan(brandProfileId);
      return plan;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/brand-memory/:brandProfileId/adaptive-plan/toggle-rule
  app.post(
    '/api/brand-memory/:brandProfileId/adaptive-plan/toggle-rule',
    async (request, reply) => {
      try {
        const { brandProfileId } = request.params as { brandProfileId: string };
        const body = request.body as { ruleId?: string; isActive?: boolean };

        if (!body.ruleId || typeof body.isActive !== 'boolean') {
          return reply
            .status(400)
            .send({ error: 'ruleId (string) and isActive (boolean) are required' });
        }

        const updated = await toggleBehaviorRule(
          brandProfileId,
          body.ruleId,
          body.isActive
        );

        if (!updated) {
          return reply.status(404).send({ error: 'Rule not found' });
        }

        return { success: true, plan: updated };
      } catch (err) {
        return reply.status(500).send(formatError(err));
      }
    }
  );

  // POST /api/brand-memory/:brandProfileId/adaptive-plan/refresh
  app.post(
    '/api/brand-memory/:brandProfileId/adaptive-plan/refresh',
    async (request, reply) => {
      try {
        const { brandProfileId } = request.params as { brandProfileId: string };

        const rules = await deriveBehaviorRules(brandProfileId);
        // Also rebuild the knowledge graph when the plan is refreshed so the
        // two stay in sync.
        try {
          const { rebuildKnowledgeGraph } = await import('../services/knowledgeGraphService');
          // Fire-and-forget — do not block the API call
          setImmediate(() => {
            rebuildKnowledgeGraph(brandProfileId).catch((err) => {
              console.error('[BrandMemory] knowledge graph rebuild failed:', err);
            });
          });
        } catch { /* ignore */ }
        return { success: true, ruleCount: rules.length, rules };
      } catch (err) {
        return reply.status(500).send(formatError(err));
      }
    }
  );
}
