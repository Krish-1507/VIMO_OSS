import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { opportunities } from '../db/schema';
import { getEffectiveBrandProfileId } from '../services/brandBrainService';
import { formatError } from '../lib/errorFormatter';

export default async function opportunityRoutes(app: FastifyInstance) {
  // GET /api/opportunities — all non-acted-on opportunities for current brand
  app.get('/api/opportunities', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = await getEffectiveBrandProfileId(query.brandProfileId);

      const urgencyOrder = sql`CASE urgency WHEN 'act_now' THEN 1 WHEN 'act_today' THEN 2 WHEN 'act_this_week' THEN 3 ELSE 4 END`;

      const rows = db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.brandProfileId, brandProfileId),
            eq(opportunities.isActedOn, 0),
          ),
        )
        .orderBy(urgencyOrder, desc(opportunities.detectedAt))
        .all();

      return rows.map((r) => ({
        id: r.id,
        brandProfileId: r.brandProfileId,
        type: r.type,
        title: r.title,
        description: r.description,
        potentialImpact: r.potentialImpact,
        urgency: r.urgency,
        actionLabel: r.actionLabel,
        actionType: r.actionType,
        actionPayload: JSON.parse(r.actionPayloadJson || '{}'),
        isActedOn: Boolean(r.isActedOn),
        detectedAt: r.detectedAt,
        actedOnAt: r.actedOnAt,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/opportunities/count
  app.get('/api/opportunities/count', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = await getEffectiveBrandProfileId(query.brandProfileId);

      const result = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.brandProfileId, brandProfileId),
            eq(opportunities.isActedOn, 0),
          ),
        )
        .get();

      return { count: (result as any)?.count ?? 0 };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/opportunities/:id/act — act on an opportunity
  app.post('/api/opportunities/:id/act', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const opp = db.select().from(opportunities).where(eq(opportunities.id, id)).get();
      if (!opp) {
        return reply.status(404).send({ error: 'Opportunity not found' });
      }

      const now = new Date().toISOString();
      db.update(opportunities)
        .set({ isActedOn: 1, actedOnAt: now })
        .where(eq(opportunities.id, id))
        .run();

      const payload = JSON.parse(opp.actionPayloadJson || '{}');

      if (opp.actionType === 'navigate') {
        return { success: true, actionType: 'navigate', route: payload.route || '/dashboard' };
      }

      if (opp.actionType === 'approve_all') {
        try {
          const { approvalRequests } = await import('../db/schema');
          const pendingApprovals = db
            .select()
            .from(approvalRequests)
            .where(
              and(
                eq(approvalRequests.status, 'pending'),
                eq(approvalRequests.requestType, payload.requestType || ''),
              ),
            )
            .all();
          for (const a of pendingApprovals) {
            db.update(approvalRequests)
              .set({ status: 'approved', reviewedAt: now, reviewedBy: 'opportunity_inbox' })
              .where(eq(approvalRequests.id, a.id))
              .run();
          }
          
          // Emit socket events for approved requests (requires approvalService)
          try {
            const { executeApprovedRequest } = await import('../services/approvalService');
            const { io } = await import('../index');
            for (const a of pendingApprovals) {
              await executeApprovedRequest(a.id);
              io?.emit('approval:executed', {
                approvalRequestId: a.id,
                requestType: a.requestType,
              });
            }
          } catch { /* ignore if fail */ }

          return { success: true, actionType: 'approve_all', approvedCount: pendingApprovals.length };
        } catch {
          return { success: true, actionType: 'approve_all', approvedCount: 0 };
        }
      }

      if (opp.actionType === 'execute') {
        // For execute types, we mark as done and return the payload for the frontend to handle
        return { success: true, actionType: 'execute', payload };
      }

      return { success: true, actionType: opp.actionType, payload };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/opportunities/:id — dismiss
  app.delete('/api/opportunities/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      db.update(opportunities)
        .set({ isActedOn: 1, actedOnAt: new Date().toISOString() })
        .where(eq(opportunities.id, id))
        .run();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/opportunities/act-all — act on all pending opportunities
  app.post('/api/opportunities/act-all', async (request, reply) => {
    try {
      const body = request.body as { brandProfileId?: string } || {};
      const brandProfileId = await getEffectiveBrandProfileId(body.brandProfileId);

      const now = new Date().toISOString();
      db.update(opportunities)
        .set({ isActedOn: 1, actedOnAt: now })
        .where(
          and(
            eq(opportunities.brandProfileId, brandProfileId),
            eq(opportunities.isActedOn, 0),
          ),
        )
        .run();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
