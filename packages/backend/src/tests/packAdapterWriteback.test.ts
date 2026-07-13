/**
 * Pack Adapter — bidirectional write-back.
 *
 * The Pack pattern was read-only discovery ("VIMO reads your tools"). This
 * test proves the bidirectional seam works: the Shopify and Notion adapters
 * can *operate* their tools (push a draft product / create a page), while the
 * other adapters stay read-only by default. Only `createExternalConnection`
 * (the real HTTP boundary) is mocked — VIMO's own routing is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createExternalConnection, fakeConnection } = vi.hoisted(() => {
  const fakeConnection = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const createExternalConnection = vi.fn(() => fakeConnection);
  return { createExternalConnection, fakeConnection };
});

vi.mock('../services/externalConnection', () => ({
  createExternalConnection,
  connectionRegistry: { get: () => null as any },
  ExternalConnection: class ExternalConnection {},
}));

import { db } from '../db';
import { connectors } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import { createPackAdapter } from '../services/packIntegrations';

async function seedConnector(provider: string, creds: Record<string, string>, config: Record<string, unknown> = {}) {
  const id = `conn_${provider}_${Math.random().toString(36).slice(2)}`;
  db.insert(connectors)
    .values({
      id,
      name: provider,
      type: 'pack',
      provider,
      status: 'active',
      configJson: JSON.stringify(config),
      encryptedCredentials: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
  for (const [k, v] of Object.entries(creds)) {
    await credentialStore.storeCredential(id, k, v);
  }
  return id;
}

beforeEach(() => {
  fakeConnection.post.mockReset();
  fakeConnection.get.mockReset();
  db.delete(connectors).run();
});

describe('PackAdapter write-back capability', () => {
  it('read-only adapters report supportsWrite() === false and refuse to write', async () => {
    const seo = createPackAdapter('seo');
    expect(seo?.supportsWrite()).toBe(false);
    const res = await seo!.write('x', { type: 'shopify_draft_product', title: 't' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/read-only/i);
  });

  it('Shopify adapter pushes a DRAFT product (published: false)', async () => {
    const id = await seedConnector('shopify', {
      apiKey: 'SHOPIFY_TOKEN',
      shopDomain: 'demo.myshopify.com',
    });
    fakeConnection.post.mockResolvedValue({ data: { product: { id: 123, handle: 'summer-sale' } } });

    const adapter = createPackAdapter('shopify')!;
    expect(adapter.supportsWrite()).toBe(true);

    const res = await adapter.write(id, {
      type: 'shopify_draft_product',
      title: 'Summer Sale',
      body: 'Our biggest sale of the year.',
      price: '19.99',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('123');
    expect(res.url).toContain('demo.myshopify.com/admin/products/123');

    // The crucial bit: it must be a *draft*, not published.
    expect(fakeConnection.post).toHaveBeenCalledWith(
      '/products.json',
      expect.objectContaining({
        product: expect.objectContaining({ title: 'Summer Sale', published: false }),
      }),
    );
  });

  it('Shopify adapter fails gracefully when credentials are missing', async () => {
    const id = await seedConnector('shopify', {});
    const res = await createPackAdapter('shopify')!.write(id, {
      type: 'shopify_draft_product',
      title: 'x',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/credentials/i);
  });

  it('Notion adapter creates a page under the configured parent', async () => {
    const id = await seedConnector('notion', { integrationToken: 'NOTION_SECRET' });
    fakeConnection.post.mockResolvedValue({ data: { id: 'page-1', url: 'https://notion.so/page-1' } });

    const adapter = createPackAdapter('notion')!;
    expect(adapter.supportsWrite()).toBe(true);

    const res = await adapter.write(id, {
      type: 'notion_page',
      title: 'Q3 Content Insight',
      body: 'Engagement peaks on weekday evenings.',
      notionParent: 'parent-page-id',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('page-1');
    expect(res.url).toBe('https://notion.so/page-1');
    expect(fakeConnection.post).toHaveBeenCalledWith(
      '/pages',
      expect.objectContaining({
        parent: { page_id: 'parent-page-id' },
        properties: expect.objectContaining({
          title: { title: [{ text: { content: 'Q3 Content Insight' } }] },
        }),
      }),
    );
  });
});
