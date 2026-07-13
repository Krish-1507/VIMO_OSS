import { FastifyInstance } from 'fastify';
import { IntegrationEngine } from '../server/integrations/engine';
import {
  integrationRegistry,
  registerBuiltInIntegrations,
} from '../server/integrations/registry';
import {
  getRecentDesignsFromStore,
  getAIDesignerPermissions,
  createCanvaIntegrationDeps,
} from '../server/integrations/canvaDeps';

const getEngine = (): IntegrationEngine => {
  // For now we keep a single in-memory engine instance for the running backend process.
  // Later this will be persisted and shared across workers.
  return (globalThis as any).__vimoIntegrationEngine as IntegrationEngine;
};

const ensureEngine = (): IntegrationEngine => {
  if ((globalThis as any).__vimoIntegrationEngine) return (globalThis as any).__vimoIntegrationEngine;

  // Register the built-in integrations (Canva/AI Designer, …) exactly once.
  registerBuiltInIntegrations();

  // The engine resolves each connection's deps from the registry, so it can
  // host more than one integration and disconnect/health always work.
  const engine = new IntegrationEngine(undefined, {
    resolveDeps: (catalogId) => integrationRegistry.get(catalogId)?.getDeps() ?? null,
  });
  (globalThis as any).__vimoIntegrationEngine = engine;
  return engine;
};

export default async function integrationsRoutes(app: FastifyInstance) {
  const engine = ensureEngine();

  // Catalog of integrations the user can connect, sourced from the registry.
  // Adding a new integration = registering it in registry.ts; the UI picks it
  // up here automatically.
  app.get('/api/integrations/catalog', async () => {
    return integrationRegistry.list().map((entry) => ({
      catalogId: entry.catalogId,
      displayName: entry.displayName,
      category: entry.category,
      connectLabel: entry.connectLabel,
    }));
  });

  app.get('/api/integrations/:connectionId/status', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const conn = engine.getConnection(connectionId);
    if (!conn) {
      return reply.status(404).send({ error: 'Connection not found' });
    }
    return conn;
  });

  app.get('/api/integrations/:connectionId/health', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const conn = engine.getConnection(connectionId);
    if (!conn) {
      return reply.status(404).send({ error: 'Connection not found' });
    }
    return engine.health(connectionId);
  });

  // One-click connect — wires up the chosen integration through its real
  // deps (resolved by catalogId from the registry). The OAuth popup itself is
  // handled on the frontend.
  app.post('/api/integrations/connect', async (request, reply) => {
    try {
      const body = request.body as {
        connectionId: string;
        catalogId: string;
        displayName: string;
        connectorId: string;
        serverUrl: string;
      };

      if (!integrationRegistry.has(body.catalogId)) {
        return reply.status(400).send({
          error: `Unknown integration: ${body.catalogId}.`,
        });
      }

      const connected = await engine.connectOneClick(body);
      return connected;
    } catch (err) {
      return reply.status(500).send({
        error: 'Could not connect. Please try again.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/integrations/:connectionId/invoke', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    try {
      const body = request.body as {
        connectorId: string;
        action: string;
        input: Record<string, unknown>;
      };

      const result = await engine.invokeAction({
        connectionId,
        connectorId: body.connectorId,
        action: body.action,
        input: body.input,
      });

      if (!result.ok) {
        return reply.status(400).send({ error: result.error });
      }
      return { data: result.data };
    } catch (err) {
      return reply.status(500).send({
        error: 'Could not complete that action.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/integrations/:connectionId/disconnect', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    await engine.disconnect(connectionId);
    return { success: true };
  });

  // Recent designs drawer — returns designs VIMO has generated via AI Designer.
  // Tolates a not-yet-connected state (the connection is only established on
  // first generate), so the drawer can populate from the persisted store.
  app.get('/api/integrations/:connectionId/recent-designs', async (request) => {
    const { connectionId } = request.params as { connectionId: string };
    const designs = await getRecentDesignsFromStore();
    return { connectionId, designs };
  });

  // Brand kit selector — lists the user's Canva brand kits when connected.
  app.get('/api/integrations/:connectionId/brand-kits', async (request) => {
    const { connectionId } = request.params as { connectionId: string };
    const deps = createCanvaIntegrationDeps();
    // list_brand_kits throws when Canva is not connected; return an empty list
    // so the brand-kit selector can gracefully hide itself.
    let kits: unknown[] = [];
    try {
      const result = (await deps.callTool('canva', 'list_brand_kits', {})) as { kits?: unknown[] };
      kits = result?.kits ?? [];
    } catch {
      kits = [];
    }
    return { connectionId, kits };
  });

  // Permission prompt gating — what VIMO will be allowed to do for this
  // integration, so the UI can show an informed "Allow VIMO to…" prompt.
  // Uses the AI Designer catalog directly so it works even before the user
  // has connected (the permission prompt is shown first).
  app.get('/api/integrations/:connectionId/permissions', async (request) => {
    const { connectionId } = request.params as { connectionId: string };
    const catalog = integrationRegistry.get('canva_ai_designer');
    return {
      connectionId,
      catalogId: 'canva_ai_designer',
      displayName: catalog?.displayName ?? 'AI Designer',
      permissions: getAIDesignerPermissions(),
      grantedActions: engine.getConnection(connectionId)?.grantedActions ?? [],
      connectLabel: catalog?.connectLabel ?? 'Connect',
    };
  });
}
