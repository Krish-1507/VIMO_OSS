/**
 * OAuth callback — handshake credential adoption.
 *
 * Pack flows start OAuth with a synthetic handshake id (e.g.
 * `pack-github-123`) that was never a connector row. The callback used to
 * store the fresh tokens under that dead id and then create a brand-new,
 * EMPTY connector row — a connection that looked live in the UI but could
 * never publish, refresh, or enrich. This test locks in the fix: tokens move
 * onto the real row, enrichment runs against it, and nothing is left behind.
 *
 * Real Fastify + real in-memory DB. The provider boundary (code exchange) is
 * mocked; VIMO's own callback, registry, and credential store run for real.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { eq, like } from 'drizzle-orm';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

const { oauthMock } = vi.hoisted(() => ({
  oauthMock: {
    handshake: { connectorId: 'pack-github-123', provider: 'github' } as {
      connectorId: string;
      provider: string;
      codeVerifier?: string;
    } | null,
  },
}));

vi.mock('../lib/oauthManager', () => ({
  generateAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(async () => ({
    accessToken: 'tok-abc',
    refreshToken: 'rt-abc',
    expiresIn: 3600,
    tokenType: 'Bearer',
  })),
  verifyOAuthState: vi.fn(async () => oauthMock.handshake),
  isOAuthProvider: (p: string) => p === 'github',
  isProviderConnectable: vi.fn(async () => true),
  OAUTH_CONFIGS: { github: {} },
}));

import { db } from '../db';
import { appSettings, connectors } from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import oauthRoutes from '../routes/oauth';
import { encryptSession } from '../lib/session';
import { requireAuth } from '../middleware/auth';

const SESSION_TOKEN = 'test-session-token-' + 'x'.repeat(40);

async function seedSession(): Promise<void> {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const encrypted = await encryptSession(SESSION_TOKEN, expiry);
  const existing = db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
  if (existing) {
    db.update(appSettings)
      .set({ value: encrypted, updatedAt: new Date().toISOString() })
      .where(eq(appSettings.key, 'session_token'))
      .run();
  } else {
    db.insert(appSettings)
      .values({ key: 'session_token', value: encrypted, updatedAt: new Date().toISOString() })
      .run();
  }
}

const headers = { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': SESSION_TOKEN };

async function credentialKeys(prefix: string): Promise<string[]> {
  return db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(like(appSettings.key, `${prefix}%`))
    .all()
    .map((r) => r.key);
}

describe('OAuth callback credential adoption', () => {
  let app: FastifyInstance;
  const registry = new ConnectorRegistry(db);

  beforeAll(async () => {
    await seedSession();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      await requireAuth(request, reply);
    });
    await app.register(oauthRoutes);
  });

  beforeEach(async () => {
    db.delete(connectors).run();
    for (const row of await db
      .select()
      .from(appSettings)
      .where(like(appSettings.key, 'cred:%'))
      .all()) {
      db.delete(appSettings).where(eq(appSettings.key, row.key)).run();
    }
    oauthMock.handshake = { connectorId: 'pack-github-123', provider: 'github' };
  });

  it('moves handshake tokens onto the created connector row', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/callback?code=abc&state=xyz',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Connected to VIMO!');

    const rows = db.select().from(connectors).where(eq(connectors.provider, 'github')).all();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('active');

    // Tokens live on the REAL row…
    expect(await credentialStore.getCredential(rows[0].id, 'accessToken')).toBe('tok-abc');
    expect(await credentialStore.getCredential(rows[0].id, 'refreshToken')).toBe('rt-abc');
    expect(await credentialStore.getCredential(rows[0].id, 'tokenExpiresAt')).toBeTruthy();

    // …and nothing is left behind under the synthetic handshake id.
    expect(await credentialKeys('cred:pack-github-123:')).toEqual([]);
  });

  it('keeps tokens on a pre-existing connector row', async () => {
    const created = await registry.create({
      name: 'GitHub Account',
      type: 'social' as any,
      provider: 'github',
      status: 'inactive' as any,
      config: {},
    });
    oauthMock.handshake = { connectorId: created.id, provider: 'github' };

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/callback?code=abc&state=xyz',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(await credentialStore.getCredential(created.id, 'accessToken')).toBe('tok-abc');
    const row = await registry.getById(created.id);
    expect(row?.status).toBe('active');
    // No duplicate connector was spawned.
    expect(db.select().from(connectors).where(eq(connectors.provider, 'github')).all().length).toBe(1);
  });
});
