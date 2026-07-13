/**
 * VIMO Assistant Routes
 *
 * POST   /api/assistant/message          — process a user message and return a response
 * GET    /api/assistant/history/:sessionId — get conversation history for a session
 * DELETE /api/assistant/history/:sessionId — clear conversation history for a session
 */

import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { assistantMessages, brandProfiles } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import { processMessage } from '../agents/vimoAssistantAgent';

export default async function assistantRoutes(app: FastifyInstance) {
  // POST /api/assistant/message — process a user message
  app.post('/api/assistant/message', async (request, reply) => {
    try {
      const body = request.body as {
        message: string;
        sessionId: string;
      };

      if (!body.message || !body.sessionId) {
        return reply.status(400).send({ error: 'message and sessionId are required' });
      }

      // Get the default brand profile
      const defaultBrand = await db.select().from(brandProfiles).all()[0] || null;

      if (!defaultBrand) {
        return reply.status(400).send({ error: 'No brand profile found. Create a brand profile first.' });
      }

      const result = await processMessage({
        userMessage: body.message,
        brandProfileId: defaultBrand.id,
        sessionId: body.sessionId,
      });

      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/assistant/history/:sessionId — get conversation history
  app.get('/api/assistant/history/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };

      const messages = db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.sessionId, sessionId))
        .orderBy(desc(assistantMessages.createdAt))
        .all()
        .reverse()
        .slice(-20);

      return messages;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/assistant/history/:sessionId — clear session history
  app.delete('/api/assistant/history/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };

      await db
        .delete(assistantMessages)
        .where(eq(assistantMessages.sessionId, sessionId))
        .run();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
