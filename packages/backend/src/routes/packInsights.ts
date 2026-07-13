import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { installedPacks } from '../db/schema';
import { getPackInsightsForDirector } from '../services/packInsightsService';
import { discoverPack } from '../services/packDiscoveryService';
import { formatError } from '../lib/errorFormatter';

export default async function packInsightsRoutes(app: FastifyInstance) {
  // POST /api/packs/discover — fetch real discovery data for a pack
  app.post('/api/packs/discover', async (request, reply) => {
    try {
      const body = request.body as {
        provider: string;
        credentials: Record<string, string>;
      };

      if (!body.provider) {
        return reply.status(400).send({ error: 'provider is required' });
      }

      const result = await discoverPack(body.provider, body.credentials || {});
      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/packs/install — register a pack installation
  app.post('/api/packs/install', async (request, reply) => {
    try {
      const body = request.body as {
        packId: string;
        packName: string;
        category: string;
        brandProfileId?: string;
        config?: Record<string, unknown>;
        discoveryItems?: { icon: string; label: string; value: string }[];
      };

      if (!body.packId || !body.packName || !body.category) {
        return reply.status(400).send({ error: 'packId, packName, and category are required' });
      }

      const brandProfileId = body.brandProfileId || 'default';
      const now = new Date().toISOString();

      // Check if already installed
      const existing = db
        .select()
        .from(installedPacks)
        .where(
          and(
            eq(installedPacks.packId, body.packId),
            eq(installedPacks.brandProfileId, brandProfileId)
          )
        )
        .get();

      const configData = { ...(body.config || {}) };
      if (body.discoveryItems && body.discoveryItems.length > 0) {
        configData.discoveryItems = body.discoveryItems;
        configData.discoveredAt = now;
      }

      if (existing) {
        // Update config with discovery data
        const existingConfig = JSON.parse(existing.configJson || '{}');
        if (body.discoveryItems && body.discoveryItems.length > 0) {
          existingConfig.discoveryItems = body.discoveryItems;
          existingConfig.discoveredAt = now;
        }
        db.update(installedPacks).set({
          configJson: JSON.stringify(existingConfig),
          updatedAt: now,
        }).where(eq(installedPacks.id, existing.id)).run();

        return reply.status(200).send({
          installed: true,
          message: `"${body.packName}" is already installed.`,
          pack: { ...existing, configJson: JSON.stringify(existingConfig) },
        });
      }

      const id = crypto.randomUUID();
      await db.insert(installedPacks).values({
        id,
        packId: body.packId,
        packName: body.packName,
        category: body.category,
        brandProfileId,
        configJson: JSON.stringify(configData),
        status: 'active',
        installedAt: now,
        updatedAt: now,
      });

      console.log(`[Packs] Installed: ${body.packName} (${body.packId}) for brand ${brandProfileId}`);

      return reply.status(201).send({
        installed: true,
        message: `"${body.packName}" installed successfully. VIMO is now learning from it.`,
        pack: {
          id,
          packId: body.packId,
          packName: body.packName,
          category: body.category,
          status: 'active',
          installedAt: now,
          configJson: JSON.stringify(configData),
        },
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/packs/uninstall — remove a pack installation
  app.delete('/api/packs/uninstall', async (request, reply) => {
    try {
      const query = request.query as { packId: string; brandProfileId?: string };
      const brandProfileId = query.brandProfileId || 'default';

      const existing = db
        .select()
        .from(installedPacks)
        .where(
          and(
            eq(installedPacks.packId, query.packId),
            eq(installedPacks.brandProfileId, brandProfileId)
          )
        )
        .get();

      if (existing) {
        db.delete(installedPacks).where(eq(installedPacks.id, existing.id)).run();
      }

      return reply.status(200).send({ uninstalled: true });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/packs/insights — get pack insights for the Director (used by frontend dashboard)
  app.get('/api/packs/insights', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = query.brandProfileId || 'default';
      const insights = await getPackInsightsForDirector(brandProfileId);
      return insights;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/packs/installed — list all installed packs
  app.get('/api/packs/installed', async (request, reply) => {
    try {
      const query = request.query as { brandProfileId?: string };
      const brandProfileId = query.brandProfileId || 'default';

      const packs = db
        .select()
        .from(installedPacks)
        .where(eq(installedPacks.brandProfileId, brandProfileId))
        .all();

      return { packs };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
