import { FastifyInstance } from 'fastify';
import { packAdapterRegistry } from '../services/packIntegrations';
import type { PackWritePayload } from '../services/packIntegrations';
import { parseBody, parseParams } from '../lib/validate';
import {
  PackProviderParamSchema,
  PackWriteSchema,
} from '../../../shared/src/schemas/requests/packs';

/**
 * Pack Connections — bidirectional operations.
 *
 * Most Pack adapters discover data (VIMO reads your tools). The adapters that
 * opt in via `supportsWrite()` can also *operate* the tool — e.g. push a draft
 * product to Shopify or a page to Notion. This route is the seam that turns
 * "VIMO reads your tools" into "VIMO operates your tools".
 */
export default async function packConnectionsRoutes(app: FastifyInstance) {
  app.get('/api/pack-connections', async () => {
    return Array.from(packAdapterRegistry.getAllAdapters().values()).map((adapter) => {
      const provider = (adapter as unknown as { constructor: { name: string } }).constructor.name
        .replace(/Adapter$/, '')
        .toLowerCase();
      return { provider, supportsWrite: adapter.supportsWrite() };
    });
  });

  app.post('/api/pack-connections/:provider/write', async (request, reply) => {
    const params = parseParams(PackProviderParamSchema, request, reply);
    if (!params) return;
    const { provider } = params;
    const body = parseBody(PackWriteSchema, request, reply);
    if (!body) return;

    const connectorId = body.connectorId;
    const payload = body.payload;
    if (!connectorId || !payload?.title) {
      return reply.status(400).send({ error: 'connectorId and payload.title are required' });
    }

    const adapter = packAdapterRegistry.getAdapter(provider);
    if (!adapter) {
      return reply.status(404).send({ error: `Unknown pack provider: ${provider}` });
    }
    if (!adapter.supportsWrite()) {
      return reply
        .status(400)
        .send({ error: `Provider "${provider}" is read-only (discovery only).` });
    }

    const result = await adapter.write(connectorId, payload as unknown as PackWritePayload);
    if (!result.success) {
      return reply.status(502).send({ error: result.error });
    }
    return result;
  });
}
