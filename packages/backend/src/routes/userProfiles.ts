import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';

const VALID_ROLES = ['owner', 'admin', 'editor', 'viewer'];

export default async function userProfileRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get('/api/user-profile', async (request, reply) => {
    try {
      const rows = await db.select().from(userProfiles).all();
      const profile = rows.length > 0 ? rows[0] : null;
      if (!profile) {
        return { id: null, name: '', email: '', role: 'owner' };
      }
      return { id: profile.id, name: profile.name, email: profile.email, role: profile.role || 'owner' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Create or update user profile
  app.post('/api/user-profile', async (request, reply) => {
    try {
      const { name, email, role } = request.body as { name?: string; email?: string; role?: string };
      if (role && !VALID_ROLES.includes(role)) {
        return reply.status(400).send({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
      }
      const rows = await db.select().from(userProfiles).all();
      const now = new Date().toISOString();

      if (rows.length > 0) {
        const existing = rows[0];
        await db.update(userProfiles)
          .set({
            name: name ?? existing.name,
            email: email ?? existing.email,
            role: role ?? existing.role ?? 'owner',
            updatedAt: now,
          })
          .where(eq(userProfiles.id, existing.id))
          .run();
        return {
          id: existing.id,
          name: name ?? existing.name,
          email: email ?? existing.email,
          role: role ?? existing.role ?? 'owner',
        };
      } else {
        const id = crypto.randomUUID();
        await db.insert(userProfiles).values({
          id,
          name: name || '',
          email: email || '',
          role: role || 'owner',
          createdAt: now,
          updatedAt: now,
        }).run();
        return { id, name: name || '', email: email || '', role: role || 'owner' };
      }
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
