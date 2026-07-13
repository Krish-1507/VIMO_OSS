/**
 * Knowledge Graph Routes
 *
 * GET  /api/knowledge-graph/relationships — top N strongest relationships for the current brand
 * GET  /api/knowledge-graph/query         — query params: entityType, entityLabel
 * POST /api/knowledge-graph/rebuild       — triggers rebuildKnowledgeGraph in the background
 */

import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import {
  getTopRelationships,
  queryKnowledge,
  rebuildKnowledgeGraph,
} from '../services/knowledgeGraphService';

export default async function knowledgeGraphRoutes(app: FastifyInstance) {
  // GET /api/knowledge-graph/relationships
  app.get('/api/knowledge-graph/relationships', async (request, reply) => {
    try {
      const brandProfileId = await resolveBrandId(request);
      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }
      const query = (request.query as Record<string, string>) || {};
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

      const rows = await getTopRelationships(brandProfileId, limit);
      return {
        brandProfileId,
        count: rows.length,
        relationships: rows.map((r) => ({
          id: r.relationship.id,
          relationshipType: r.relationship.relationshipType,
          strength: r.relationship.strength,
          sampleSize: r.relationship.sampleSize,
          lastObserved: r.relationship.lastObserved,
          from: {
            id: r.fromEntity.id,
            type: r.fromEntity.entityType,
            label: r.fromEntity.entityLabel,
          },
          to: {
            id: r.toEntity.id,
            type: r.toEntity.entityType,
            label: r.toEntity.entityLabel,
          },
        })),
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/knowledge-graph/query
  app.get('/api/knowledge-graph/query', async (request, reply) => {
    try {
      const brandProfileId = await resolveBrandId(request);
      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }
      const query = (request.query as Record<string, string>) || {};
      const entityType = (query.entityType || '').trim();
      const entityLabel = (query.entityLabel || '').trim();
      if (!entityType || !entityLabel) {
        return reply
          .status(400)
          .send({ error: 'entityType and entityLabel are required' });
      }
      const result = await queryKnowledge({ brandProfileId, entityType, entityLabel });
      if (!result) {
        return reply.status(404).send({ error: 'Entity not found' });
      }
      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/knowledge-graph/rebuild
  app.post('/api/knowledge-graph/rebuild', async (request, reply) => {
    try {
      const brandProfileId = await resolveBrandId(request);
      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }
      // Fire-and-forget — do not block the API call
      setImmediate(() => {
        rebuildKnowledgeGraph(brandProfileId).catch((err) => {
          console.error('[KnowledgeGraph] background rebuild failed:', err);
        });
      });
      return { success: true, message: 'Rebuild started in background.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}

/**
 * Resolve the brand profile id from the request. Falls back to the
 * first brand profile in the DB or the default brand id from settings.
 */
async function resolveBrandId(request: any): Promise<string | null> {
  const query = (request.query as Record<string, string>) || {};
  const body = (request.body as Record<string, string>) || {};
  const explicit = (query.brandProfileId || body.brandProfileId || '').toString().trim();
  if (explicit) return explicit;

  // Try default brand from app_settings
  try {
    const { appSettings: as } = await import('../db/schema');
    const row = db
      .select()
      .from(as)
      .where(eq(as.key, 'defaultBrandId'))
      .get();
    if (row && row.value) return row.value;
  } catch {
    // ignore
  }

  // Fall back to the first brand profile in the DB
  const first = db.select().from(brandProfiles).limit(1).get();
  if (first) return first.id;
  return null;
}
