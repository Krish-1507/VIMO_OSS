import { FastifyInstance } from 'fastify';
import {
  getEngagementQueue,
  generateReply,
  approveReply,
  editAndReply,
  hideEngagementComment,
  skipEngagementItem,
  getEngagementStats,
} from '../services/engagementService';
import { runEngagementPipeline } from '../services/engagementPollingService';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { db } from '../db';
import { connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';

export default async function engagementRoutes(app: FastifyInstance) {
  const aiRateLimit = {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
  };

  // GET /api/engagement/queue — fetch engagement queue
  app.get('/api/engagement/queue', aiRateLimit, async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      return await getEngagementQueue(query.brandProfileId);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/engagement/stats — engagement stats for the header
  app.get('/api/engagement/stats', aiRateLimit, async (_request, reply) => {
    try {
      return await getEngagementStats();
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/sync — manually trigger the engagement pipeline
  app.post('/api/engagement/sync', aiRateLimit, async (_request, reply) => {
    try {
      // Find the first active Instagram connector
      const registry = new ConnectorRegistry(db);
      const allConnectors = await registry.getAll();
      const instagramConnector = allConnectors.find(
        (c) => c.provider === 'instagram' && c.status === 'active'
      );

      if (!instagramConnector) {
        return reply.status(400).send({
          error: 'No active Instagram connector found. Connect your Instagram account first.',
        });
      }

      const result = await runEngagementPipeline(instagramConnector.id);
      return { success: true, ...result };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/:id/generate-reply — generate AI reply
  app.post('/api/engagement/:id/generate-reply', aiRateLimit, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await generateReply(id);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/:id/approve — approve and send reply
  app.post('/api/engagement/:id/approve', aiRateLimit, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await approveReply(id);
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/:id/edit-reply — edit reply text then approve
  app.post('/api/engagement/:id/edit-reply', aiRateLimit, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { replyText } = request.body as { replyText: string };
      if (!replyText) {
        return reply.status(400).send({ error: 'replyText is required' });
      }
      await editAndReply(id, replyText);
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/:id/hide — hide a comment
  app.post('/api/engagement/:id/hide', aiRateLimit, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await hideEngagementComment(id);
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/engagement/:id/skip — skip an item
  app.post('/api/engagement/:id/skip', aiRateLimit, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await skipEngagementItem(id);
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
