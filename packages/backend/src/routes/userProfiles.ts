import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';

export default async function userProfileRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get('/api/user-profile', async (request, reply) => {
    try {
      const rows = await db.select().from(userProfiles).all();
      const profile = rows.length > 0 ? rows[0] : null;
      if (!profile) {
        return { id: null, name: '', email: '' };
      }
      return { id: profile.id, name: profile.name, email: profile.email };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Create or update user profile
  app.post('/api/user-profile', async (request, reply) => {
    try {
      const { name, email } = request.body as { name?: string; email?: string };
      const rows = await db.select().from(userProfiles).all();
      const now = new Date().toISOString();

      if (rows.length > 0) {
        const existing = rows[0];
        await db.update(userProfiles)
          .set({
            name: name ?? existing.name,
            email: email ?? existing.email,
            updatedAt: now,
          })
          .where(eq(userProfiles.id, existing.id))
          .run();
        return { id: existing.id, name: name ?? existing.name, email: email ?? existing.email };
      } else {
        const id = crypto.randomUUID();
        await db.insert(userProfiles).values({
          id,
          name: name || '',
          email: email || '',
          createdAt: now,
          updatedAt: now,
        }).run();
        return { id, name: name || '', email: email || '' };
      }
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
