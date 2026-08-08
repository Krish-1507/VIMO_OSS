/**
 * Request validation boundary (B1).
 *
 * These handlers used to read `request.body as { ... }`, which is a compile-time
 * lie — TypeScript believes the shape, the runtime gets whatever the client
 * sent, and a missing field surfaced as a 500 deep in the handler. Now every
 * state-changing connector / pack / social route runs its body through a Zod
 * schema in `packages/shared/src/schemas/requests` and returns 400 at the edge.
 *
 * The point of this test is to lock the contract: a malformed body must be a
 * 400 ValidationError, never a 500 or a silent partial write. The auth check is
 * exercised separately — these routes are registered here WITHOUT the
 * requireAuth hook, exactly as the other route-level tests do.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import connectorRoutes from '../routes/connectors';
import packInsightsRoutes from '../routes/packInsights';
import packConnectionsRoutes from '../routes/packConnections';
import socialAccountsRoutes from '../routes/socialAccounts';

interface Bad {
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload: unknown;
}

const cases: Array<{ name: string } & Bad> = [
  { name: 'create connector without name', method: 'POST', url: '/api/connectors', payload: { type: 'custom', provider: 'x' } },
  { name: 'builder without provider', method: 'POST', url: '/api/connectors/builder', payload: { name: 'X' } },
  { name: 'test-credentials without provider', method: 'POST', url: '/api/connectors/test-credentials', payload: {} },
  { name: 'mcp connect without serverUrl', method: 'POST', url: '/api/connectors/mcp/connect', payload: { connectorId: 'c' } },
  {
    name: 'install pack without required fields',
    method: 'POST',
    url: '/api/packs/install',
    payload: { packId: 'p' },
  },
  { name: 'discover without provider', method: 'POST', url: '/api/packs/discover', payload: {} },
  {
    name: 'save social credentials without clientId',
    method: 'POST',
    url: '/api/social-accounts/save-credentials',
    payload: { provider: 'instagram' },
  },
  { name: 'connect app-password without provider', method: 'POST', url: '/api/social-accounts/connect-app-password', payload: {} },
  {
    name: 'pack write without connectorId',
    method: 'POST',
    url: '/api/pack-connections/shopify/write',
    payload: { payload: { title: 't' } },
  },
];

describe('request validation boundary', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    await app.register(connectorRoutes);
    await app.register(packInsightsRoutes);
    await app.register(packConnectionsRoutes);
    await app.register(socialAccountsRoutes);
    await app.ready();
  });

  for (const c of cases) {
    it(`rejects ${c.name} with 400 ValidationError`, async () => {
      const res = await app.inject({
        method: c.method,
        url: c.url,
        payload: c.payload as any,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'ValidationError' });
    });
  }

  it('returns a field-level issue list, not just a generic message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors',
      payload: { type: 'custom' },
    });

    const body = res.json() as { issues?: Array<{ path: string; message: string }> };
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues!.length).toBeGreaterThan(0);
    expect(body.issues!.some((i) => i.path === 'name')).toBe(true);
  });

  it('rejects a wrong-typed field (name as a number) with 400 ValidationError', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors',
      payload: { name: 1234, type: 'custom', provider: 'x' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string; issues?: Array<{ path: string }> };
    expect(body.error).toBe('ValidationError');
    expect(body.issues?.some((i) => i.path === 'name')).toBe(true);
  });
});
