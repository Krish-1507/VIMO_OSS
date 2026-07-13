import { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { decryptSession } from '../lib/session';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers['x-session-token'] as string | undefined;
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const sessionRow = await db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
  const session = await decryptSession(sessionRow);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.token !== token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.expiry && Date.now() > session.expiry) {
    return reply.status(401).send({ error: 'Session expired' });
  }
}
