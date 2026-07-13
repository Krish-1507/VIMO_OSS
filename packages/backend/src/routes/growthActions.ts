/**
 * Growth Actions Routes
 *
 * GET  /api/growth-actions            — list all growth actions for current brand profile
 * POST /api/growth-actions/:id/approve — approve an action (promotes draft posts to pending)
 * DELETE /api/growth-actions/:id       — dismiss/delete an action
 */

import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { growthActions, scheduledPosts } from '../db/schema';
import { formatError } from '../lib/errorFormatter';

export default async function growthActionsRoutes(app: FastifyInstance) {
  // GET /api/growth-actions — returns all growth actions for the current brand profile
  app.get('/api/growth-actions', async (request, reply) => {
    try {
      // Return all growth actions, sorted by newest first
      const actions = db
        .select()
        .from(growthActions)
        .orderBy(desc(growthActions.createdAt))
        .all();

      // Enrich with source post content preview
      const enriched = await Promise.all(
        actions.map(async (action) => {
          let sourcePostPreview: string | null = null;
          try {
            const sourcePost = await db
              .select({ content: scheduledPosts.content, platform: scheduledPosts.platform })
              .from(scheduledPosts)
              .where(eq(scheduledPosts.id, action.sourcePostId))
              .get();
            if (sourcePost) {
              sourcePostPreview = sourcePost.content.substring(0, 200);
            }
          } catch {
            // ignore
          }

          return {
            ...action,
            sourcePostPreview,
          };
        })
      );

      return enriched;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/growth-actions/:id/approve — approve an action
  app.post('/api/growth-actions/:id/approve', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const action = await db
        .select()
        .from(growthActions)
        .where(eq(growthActions.id, id))
        .get();

      if (!action) {
        return reply.status(404).send({ error: 'Growth action not found' });
      }

      // Update action status to approved
      await db
        .update(growthActions)
        .set({ status: 'approved' })
        .where(eq(growthActions.id, id))
        .run();

      // Find any draft posts associated with this action and promote them to pending
      const associatedPosts = await db
        .select()
        .from(scheduledPosts)
        .where(
          and(
            eq(scheduledPosts.status, 'draft'),
            // We check in JS since metadataJson may contain growthActionId
          )
        )
        .all();

      // Filter posts whose metadata contains this growth action ID
      for (const post of associatedPosts) {
        try {
          const meta = post.metadataJson ? JSON.parse(post.metadataJson) : {};
          if (meta.growthActionId === id) {
            await db
              .update(scheduledPosts)
              .set({
                status: 'pending',
                updatedAt: new Date().toISOString(),
              })
              .where(eq(scheduledPosts.id, post.id))
              .run();
          }
        } catch {
          // skip posts with unparseable metadata
        }
      }

      return {
        success: true,
        message: 'Action approved. Associated draft posts have been moved to pending.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/growth-actions/:id — dismiss/delete an action
  app.delete('/api/growth-actions/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const action = await db
        .select()
        .from(growthActions)
        .where(eq(growthActions.id, id))
        .get();

      if (!action) {
        return reply.status(404).send({ error: 'Growth action not found' });
      }

      // Delete associated draft posts if they exist
      const allPosts = db
        .select()
        .from(scheduledPosts)
        .all();
      const associatedPosts = allPosts.filter((p: any) => {
        if (p.status !== 'draft') return false;
        try {
          const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
          return meta.growthActionId === id;
        } catch {
          return false;
        }
      });

      for (const post of associatedPosts) {
        await db
          .update(scheduledPosts)
          .set({
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, post.id))
          .run();
      }

      // Delete the action
      await db.delete(growthActions).where(eq(growthActions.id, id)).run();

      return {
        success: true,
        message: 'Action dismissed.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
