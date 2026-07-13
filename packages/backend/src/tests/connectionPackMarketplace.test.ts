/**
 * Connection-layer integration tests — Pack Marketplace.
 *
 * Two real surfaces are exercised here, each with the *external* API mocked:
 *
 *  1. `discoverPack` — the live, read-only probe the marketplace runs against
 *     a provider to surface real numbers (products, repos, balance, …) and to
 *     validate that a credential actually works before we call it "Connected".
 *
 *  2. `packAdapterRegistry` — the adapters the marketplace installs. They pull
 *     live data through VIMO's ExternalConnection wrapper, record the sync
 *     outcome on the real connector row, and report connection health.
 *
 * Only the outbound HTTP (axios) is mocked. The DB, credential store, and
 * connector registry are the real, in-memory instances.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the external API boundary only. `axios.create` returns the same shared
// fake instance so ExternalConnection (which routes through client.request and
// registers interceptors) is fully intercepted too.
const { http } = vi.hoisted(() => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    create: vi.fn(),
  };
  http.create.mockReturnValue(http);
  return { http };
});
vi.mock('axios', () => ({ default: http, ...http }));

import axios from 'axios';
import { discoverPack } from '../services/packDiscoveryService';
import { packAdapterRegistry } from '../services/packIntegrations';
import { db } from '../db';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';

const registry = new ConnectorRegistry(db);

function resetHttp() {
  (axios.get as any).mockReset();
  (axios.post as any).mockReset();
  (axios.delete as any).mockReset();
  (axios.request as any).mockReset();
}

// `discoverPack` calls axios.get/post directly (default instance).
function mockDirectGetRoutes(routes: Array<[string, unknown]>) {
  (axios.get as any).mockImplementation(async (url: string) => {
    for (const [substr, data] of routes) {
      if (url.includes(substr)) return { data };
    }
    throw new Error(`Unexpected GET to ${url}`);
  });
}

function mockDirectGetThrows(substr: string, status: number) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url.includes(substr)) {
      throw Object.assign(new Error(`HTTP ${status}`), {
        response: { status, data: { error: `HTTP ${status}` } },
      });
    }
    throw new Error(`Unexpected GET to ${url}`);
  });
}

// The pack adapters go through ExternalConnection → client.request(config).
function mockRequestRoutes(routes: Array<[string, unknown]>) {
  (axios.request as any).mockImplementation(async (config: { url?: string }) => {
    for (const [substr, data] of routes) {
      if ((config.url || '').includes(substr)) return { data };
    }
    throw new Error(`Unexpected request to ${config.url}`);
  });
}

describe('Pack Marketplace — discover', () => {
  beforeEach(resetHttp);

  it('Shopify: returns real discovery items when credentials are valid', async () => {
    mockDirectGetRoutes([
      ['products.json', { products: [{ id: 1 }, { id: 2 }] }],
      ['custom_collections.json', { custom_collections: [{ id: 1 }] }],
      ['orders.json', { orders: [] }],
    ]);

    const res = await discoverPack('shopify', {
      apiKey: 'shpat_test',
      shopDomain: 'my-store.myshopify.com',
    });

    expect(res.success).toBe(true);
    expect(res.items.some((i) => /Products/i.test(i.label))).toBe(true);
  });

  it('Shopify: fails honestly when credentials are missing', async () => {
    const res = await discoverPack('shopify', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/API key|domain/i);
  });

  it('Shopify: surfaces the real HTTP error when the API rejects the key', async () => {
    mockDirectGetThrows('admin/api/2024-01', 401);
    const res = await discoverPack('shopify', {
      apiKey: 'bad',
      shopDomain: 'my-store.myshopify.com',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/401|Shopify API error/i);
  });

  it('GitHub: validates a token by listing repos', async () => {
    mockDirectGetRoutes([['/user/repos', [{ name: 'a' }, { name: 'b' }, { name: 'c' }]]]);
    const res = await discoverPack('github', { accessToken: 'ghp_test' });
    expect(res.success).toBe(true);
    expect(res.items.some((i) => /Repositories/.test(i.label))).toBe(true);
  });

  it('GitHub: fails when no token is supplied', async () => {
    const res = await discoverPack('github', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/access token/i);
  });

  it('Stripe: reads balance + recent charges', async () => {
    mockDirectGetRoutes([
      ['v1/balance', { available: [{ amount: 12345, currency: 'usd' }] }],
      ['v1/charges', { data: [{ id: 'ch_1' }, { id: 'ch_2' }] }],
    ]);
    const res = await discoverPack('stripe', { apiKey: 'sk_test' });
    expect(res.success).toBe(true);
    expect(res.items.some((i) => /balance/i.test(i.label))).toBe(true);
  });

  it('SEO: inspects the provided website and reports real signals', async () => {
    mockDirectGetRoutes([
      ['example.com', '<html><head><title>My Site</title><meta name="description" content="x"></head><body><h1>A</h1></body></html>'],
    ]);
    const res = await discoverPack('seo', { websiteUrl: 'https://example.com' });
    expect(res.success).toBe(true);
    expect(res.items.some((i) => /title/i.test(i.label))).toBe(true);
  });

  it('SEO: asks for a URL instead of fabricating metrics', async () => {
    const res = await discoverPack('seo', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/website URL/i);
  });

  it('returns an honest failure for an unsupported provider', async () => {
    const res = await discoverPack('does-not-exist', {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not yet available/i);
  });
});

describe('Pack Marketplace — adapters (sync + health)', () => {
  let connectorId = '';

  afterEach(async () => {
    if (connectorId) {
      await registry.delete(connectorId).catch(() => {});
      connectorId = '';
    }
    resetHttp();
  });

  async function seedConnector(provider: string, credentials: Record<string, string>) {
    const connector = await registry.create({
      name: provider,
      type: 'social',
      provider,
      status: 'active',
      config: {},
    });
    connectorId = connector.id;
    for (const [key, value] of Object.entries(credentials)) {
      await credentialStore.storeCredential(connector.id, key, value);
    }
    return connector;
  }

  it('GitHub adapter syncs repos and reports a healthy connection', async () => {
    await seedConnector('github', { accessToken: 'ghp_test' });
    mockRequestRoutes([['/user/repos', [{ name: 'a' }, { name: 'b' }]]]);

    const adapter = packAdapterRegistry.getAdapter('github')!;
    const sync = await adapter.sync(connectorId);

    expect(sync.success).toBe(true);
    expect(sync.itemsSynced).toBe(2);
    expect(sync.newDataFound).toBe(true);

    const status = await adapter.getStatus(connectorId);
    expect(status.status).toBe('connected');
    expect(status.health).toBe('healthy');
    expect(status.packType).toBe('knowledge');
    expect(status.dataPoints).toBe(2);
  });

  it('GitHub adapter reports an error when the token is missing', async () => {
    await seedConnector('github', {});

    const adapter = packAdapterRegistry.getAdapter('github')!;
    const sync = await adapter.sync(connectorId);

    expect(sync.success).toBe(false);
    expect(sync.errors.length).toBeGreaterThan(0);

    const status = await adapter.getStatus(connectorId);
    expect(status.status).toBe('error');
  });

  it('Shopify adapter syncs products via the ExternalConnection wrapper', async () => {
    await seedConnector('shopify', { apiKey: 'shpat_test', shopDomain: 'my-store.myshopify.com' });
    mockRequestRoutes([['products.json', { products: [{ id: 1 }, { id: 2 }, { id: 3 }] }]]);

    const adapter = packAdapterRegistry.getAdapter('shopify')!;
    const sync = await adapter.sync(connectorId);

    expect(sync.success).toBe(true);
    expect(sync.itemsSynced).toBe(3);

    const status = await adapter.getStatus(connectorId);
    expect(status.status).toBe('connected');
    expect(status.packType).toBe('creative');
  });
});
