import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { directorSessions } from '../db/schema';
import { runMarketingDirector, markActionExecuted } from '../agents/marketingDirector';
import { getEffectiveBrandProfileId } from '../services/brandBrainService';
import { formatError } from '../lib/errorFormatter';

export default async function directorRoutes(app: FastifyInstance) {
  // GET /api/director/latest — returns the most recent director session for the current brand profile
  app.get('/api/director/latest', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = await getEffectiveBrandProfileId(query.brandProfileId);

      const session = db
        .select()
        .from(directorSessions)
        .where(eq(directorSessions.brandProfileId, brandProfileId))
        .orderBy(desc(directorSessions.createdAt))
        .limit(1)
        .all();

      if (!session || session.length === 0) {
        return { session: null };
      }

      const s = session[0];
      return {
        session: {
          id: s.id,
          brandProfileId: s.brandProfileId,
          trigger: s.trigger,
          researchReport: s.researchReportJson ? JSON.parse(s.researchReportJson) : null,
          analyticsInsights: s.analyticsInsightsJson ? JSON.parse(s.analyticsInsightsJson) : null,
          contentOpportunities: s.contentOpportunitiesJson ? JSON.parse(s.contentOpportunitiesJson) : null,
          engagementStats: s.engagementStatsJson ? JSON.parse(s.engagementStatsJson) : null,
          directorSummary: s.directorSummary,
          recommendedActions: s.recommendedActionsJson ? JSON.parse(s.recommendedActionsJson) : [],
          createdAt: s.createdAt,
        },
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/director/history — returns the last 10 director sessions with summary and recommendedActions only
  app.get('/api/director/history', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = await getEffectiveBrandProfileId(query.brandProfileId);

      const sessions = db
        .select({
          id: directorSessions.id,
          brandProfileId: directorSessions.brandProfileId,
          trigger: directorSessions.trigger,
          directorSummary: directorSessions.directorSummary,
          recommendedActionsJson: directorSessions.recommendedActionsJson,
          createdAt: directorSessions.createdAt,
        })
        .from(directorSessions)
        .where(eq(directorSessions.brandProfileId, brandProfileId))
        .orderBy(desc(directorSessions.createdAt))
        .limit(10)
        .all();

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          trigger: s.trigger,
          directorSummary: s.directorSummary,
          recommendedActions: s.recommendedActionsJson ? JSON.parse(s.recommendedActionsJson) : [],
          createdAt: s.createdAt,
        })),
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/director/run — triggers a manual run immediately
  app.post('/api/director/run', async (request, reply) => {
    try {
      const body = request.body as { brandProfileId?: string } || {};
      const brandProfileId = await getEffectiveBrandProfileId(body.brandProfileId);

      const sessionId = await runMarketingDirector({
        brandProfileId,
        trigger: 'user_requested',
      });

      return {
        sessionId,
        message: 'Marketing Director is analyzing your brand. Results will appear in 30-60 seconds.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/director/actions/:actionId/execute — marks an action as executed
  app.post('/api/director/actions/:actionId/execute', async (request, reply) => {
    try {
      const { actionId } = request.params as { actionId: string };
      const body = request.body as { sessionId: string };

      if (!body.sessionId) {
        return reply.status(400).send({ error: 'sessionId is required in request body' });
      }

      // Find the session and get the action details
      const session = db
        .select()
        .from(directorSessions)
        .where(eq(directorSessions.id, body.sessionId))
        .get();

      if (!session) {
        return reply.status(404).send({ error: 'Director session not found' });
      }

      const actions = session.recommendedActionsJson
        ? JSON.parse(session.recommendedActionsJson)
        : [];

      const action = actions.find((a: any) => a.id === actionId);

      if (!action) {
        return reply.status(404).send({ error: 'Action not found in session' });
      }

      await markActionExecuted(body.sessionId, actionId);

      return {
        success: true,
        action,
        // For create_content actions, return the content brief so frontend can navigate
        navigateTo: action.category === 'create_content' ? '/content' : undefined,
        contentBrief: action.actionPayload || {},
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
