import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { installedPacks } from '../db/schema';
import { getPackInsightsForDirector } from '../services/packInsightsService';
import { discoverPack } from '../services/packDiscoveryService';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { formatError } from '../lib/errorFormatter';
import { closeConnectorServer } from '../mcp/builtin-server';
import { parseBody, parseQuery } from '../lib/validate';
import {
  PackDiscoverSchema,
  PackInstallSchema,
  PackUninstallQuerySchema,
  PackProviderParamSchema,
} from '../../../shared/src/schemas/requests/packs';

const registry = new ConnectorRegistry(db);

/**
 * The pack <-> connector relationship.
 *
 * A pack can spawn one or more underlying connectors (e.g. the "GitHub Knowledge
 * Pack" requires a GitHub connector so VIMO can read repos). When a pack is
 * uninstalled we must also remove any connectors it owns so we never leave
 * orphaned credential rows or dead MCP server sockets behind.
 *
 * `providerAliases` covers cases where a pack's "provider" is a friendlier
 * display name (e.g. "shopify", "stripe") that maps onto the same
 * connector provider the marketplace installer creates.
 */
const PACK_PROVIDER_TO_CONNECTOR_PROVIDER: Record<string, string> = {
  // Marketplace pack providers
  github: 'github',
  notion: 'notion',
  slack: 'slack',
  'google-drive': 'google-drive',
  linear: 'linear',
  hubspot: 'hubspot',
  'competitor-tracking': 'competitor-tracking',
  seo: 'seo',
  'website-analytics': 'website-analytics',
  'customer-feedback': 'customer-feedback',
  'review-monitoring': 'review-monitoring',
  'market-research': 'market-research',
  canva: 'canva',
  figma: 'figma',
  'adobe-express': 'adobe-express',
  shopify: 'shopify',
  woocommerce: 'woocommerce',
  stripe: 'stripe',
  'social-accounts': 'vimosocial',
};

function resolveConnectorProvider(packProvider: string): string {
  return PACK_PROVIDER_TO_CONNECTOR_PROVIDER[packProvider] || packProvider;
}

/**
 * When uninstalling a pack, find and remove any connectors that were created
 * for it. We prefer the explicit `provider` saved on the pack (set by the
 * install endpoint from the UI's connectorPack.provider). If that isn't
 * available we fall back to the packId-to-provider map. Credentials and
 * MCP server sockets are torn down alongside the connector row.
 */
async function cleanupPackConnectors(
  packId: string,
  savedConfig: Record<string, unknown> | null,
): Promise<number> {
  const providerFromConfig =
    typeof savedConfig?.provider === 'string' ? (savedConfig.provider as string) : null;
  const provider = providerFromConfig || resolveConnectorProvider(packId);

  const all = await registry.getAll();
  const matches = all.filter((c) => c.provider === provider);
  for (const c of matches) {
    try {
      await closeConnectorServer(c.id);
    } catch (err) {
      // best-effort
      console.warn('[vimo] best-effort operation failed:', err);
    }
    await registry.delete(c.id);
  }
  return matches.length;
}

function parseInstalledPackRow(row: any) {
  return {
    id: row.id,
    packId: row.packId,
    packName: row.packName,
    category: row.category,
    brandProfileId: row.brandProfileId,
    status: row.status,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    configJson: row.configJson,
  };
}

export default async function packInsightsRoutes(app: FastifyInstance) {
  // POST /api/packs/discover — fetch real discovery data for a pack
  app.post('/api/packs/discover', async (request, reply) => {
    try {
      const body = parseBody(PackDiscoverSchema, request, reply);
      if (!body) return;

      const result = await discoverPack(body.provider, body.credentials || {});
      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/packs/install — register a pack installation
  app.post('/api/packs/install', async (request, reply) => {
    try {
      const body = parseBody(PackInstallSchema, request, reply);
      if (!body) return;

      const brandProfileId = body.brandProfileId || 'default';
      const now = new Date().toISOString();

      // We persist the connector provider inside the pack's configJson so the
      // uninstall endpoint can find the right connectors to tear down. The
      // packId is a UI label (e.g. "notion-knowledge") and doesn't always
      // match the connector's `provider` (e.g. "notion"). The caller is the
      // source of truth, so we accept whatever they send.
      const configData: Record<string, unknown> = { ...(body.config || {}) };
      if (body.provider && typeof body.provider === 'string') {
        configData.provider = body.provider;
      }
      if (body.discoveryItems && body.discoveryItems.length > 0) {
        configData.discoveryItems = body.discoveryItems;
        configData.discoveredAt = now;
      }

      // Check if already installed — install is idempotent.
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

      if (existing) {
        // Update config with discovery data. We merge the new config into the
        // existing one instead of replacing it so we never blow away
        // credentials or settings the user has already saved.
        let existingConfig: Record<string, unknown> = {};
        try {
          existingConfig = JSON.parse(existing.configJson || '{}');
          if (typeof existingConfig !== 'object' || Array.isArray(existingConfig)) {
            existingConfig = {};
          }
        } catch {
          existingConfig = {};
        }
        const merged: Record<string, unknown> = { ...existingConfig, ...configData };
        if (body.discoveryItems && body.discoveryItems.length > 0) {
          merged.discoveryItems = body.discoveryItems;
          merged.discoveredAt = now;
        }

        db.update(installedPacks)
          .set({ configJson: JSON.stringify(merged), updatedAt: now })
          .where(eq(installedPacks.id, existing.id))
          .run();

        return reply.status(200).send({
          installed: true,
          alreadyInstalled: true,
          message: `"${body.packName}" is already installed.`,
          pack: { ...parseInstalledPackRow(existing), configJson: JSON.stringify(merged) },
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
        alreadyInstalled: false,
        message: `"${body.packName}" installed successfully. VIMO is now learning from it.`,
        pack: parseInstalledPackRow({
          id,
          packId: body.packId,
          packName: body.packName,
          category: body.category,
          brandProfileId,
          status: 'active',
          installedAt: now,
          updatedAt: now,
          configJson: JSON.stringify(configData),
        }),
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/packs/uninstall — remove a pack installation AND its connectors
  app.delete('/api/packs/uninstall', async (request, reply) => {
    try {
      const query = parseQuery(PackUninstallQuerySchema, request, reply);
      if (!query) return;

      const brandProfileId = query.brandProfileId || query.brandId || 'default';

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

      if (!existing) {
        return reply.status(404).send({
          uninstalled: false,
          error: `Pack "${query.packId}" is not installed for brand "${brandProfileId}".`,
        });
      }

      // Remove the pack row first. If connector cleanup fails the pack is
      // still uninstalled (the user can always re-install the pack).
      let savedConfig: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(existing.configJson || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          savedConfig = parsed as Record<string, unknown>;
        }
      } catch (err) {
        // best-effort
        console.warn('[vimo] best-effort operation failed:', err);
      }

      db.delete(installedPacks).where(eq(installedPacks.id, existing.id)).run();

      // Then tear down any connectors the pack had spawned. This guarantees
      // we never leave orphaned credential rows or dead MCP server sockets.
      let removedConnectors = 0;
      try {
        removedConnectors = await cleanupPackConnectors(existing.packId, savedConfig);
      } catch (cleanupErr) {
        console.warn(`[Packs] Connector cleanup during uninstall failed for ${query.packId}:`, cleanupErr);
      }

      console.log(
        `[Packs] Uninstalled: ${existing.packName} (${existing.packId}) for brand ${brandProfileId}, removed ${removedConnectors} connector(s)`
      );

      return reply.status(200).send({
        uninstalled: true,
        packId: existing.packId,
        packName: existing.packName,
        brandProfileId,
        removedConnectors,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/packs/insights — get pack insights for the Director (used by frontend dashboard)
  app.get('/api/packs/insights', async (request, reply) => {
    try {
      const query = (request.query || {}) as { brandProfileId?: string };
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
      const query = (request.query || {}) as { brandProfileId?: string };
      const brandProfileId = query.brandProfileId || 'default';

      const packs = db
        .select()
        .from(installedPacks)
        .where(eq(installedPacks.brandProfileId, brandProfileId))
        .all();

      return { packs: packs.map(parseInstalledPackRow) };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
