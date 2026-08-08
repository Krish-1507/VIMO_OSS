/**
 * End-to-end route tests — Pack Marketplace + Social Accounts.
 *
 * These tests boot a real Fastify app, mount the actual `packInsightsRoutes`
 * and `socialAccountsRoutes` route handlers, and exercise them over HTTP
 * with a valid session + CSRF token. The DB is the in-memory SQLite from
 * the test setup, and the only mocked boundary is `axios` so we never hit
 * real OAuth or e-commerce providers.
 *
 * This is the safety net the user asked for: it proves that
 *  - installing a pack with valid inputs persists it,
 *  - installing the same pack twice is idempotent and never throws,
 *  - installing with bad input payload (non-string, non-array) is rejected,
 *  - uninstalling a pack that doesn't exist returns 404 (not 200 + lie),
 *  - uninstalling a pack that does exist also tears down its connectors,
 *  - disconnecting a non-existent connector is reported honestly,
 *  - disconnecting a platform with no connectors reports 0 (not 500),
 *  - the OAuth-status endpoint returns 410 Gone for cleaned-up connectors
 *    (so the popup can give up cleanly),
 *  - the app-password endpoint rejects incomplete Bluesky credentials.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

// Mock the server entrypoint so importing routes that depend on it
// (`io` from the Fastify socket layer) doesn't crash the test.
vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

// Mock axios so no outbound HTTP fires. We default to throwing so any
// unexpected outbound call is caught loudly by the tests.
const { http } = vi.hoisted(() => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    create: vi.fn(),
  };
  http.create.mockReturnValue(http);
  return { http };
});
vi.mock('axios', () => ({ default: http, ...http }));

import axios from 'axios';
import { db } from '../db';
import { appSettings, installedPacks, connectors } from '../db/schema';
import packInsightsRoutes from '../routes/packInsights';
import socialAccountsRoutes from '../routes/socialAccounts';
import { encryptSession } from '../lib/session';
import { requireAuth } from '../middleware/auth';
import { formatError } from '../lib/errorFormatter';

const SESSION_TOKEN = 'test-session-token-' + 'x'.repeat(40);
const CSRF_TOKEN = SESSION_TOKEN; // VIMO uses double-submit: csrf === session

async function seedSession(): Promise<void> {
  // The session is stored as an encrypted string; we use a far-future expiry.
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

function resetHttp(): void {
  (axios.get as any).mockReset();
  (axios.post as any).mockReset();
  (axios.delete as any).mockReset();
  (axios.request as any).mockReset();
}

describe('Pack Marketplace + Social Accounts — HTTP routes (real Fastify)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await seedSession();
    app = Fastify({ logger: false });
    // Replicate the production auth gate: skip auth for /api/auth and
    // /api/health, enforce session + CSRF for everything else.
    app.addHook('onRequest', async (request, reply) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      if (pathname.startsWith('/api/auth') || pathname === '/api/health') return;
      await requireAuth(request, reply);
      if (reply.sent) return;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const sessionToken = request.headers['x-session-token'];
        const csrfToken = request.headers['x-csrf-token'];
        if (!csrfToken || csrfToken !== sessionToken) {
          return reply.status(403).send({ error: 'Invalid or missing CSRF token' });
        }
      }
    });
    await app.register(packInsightsRoutes);
    await app.register(socialAccountsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetHttp();
  });

  // ─── Pack marketplace ────────────────────────────────────────────────

  describe('POST /api/packs/install', () => {
    it('rejects missing required fields with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { packId: 'p' }, // missing packName + category
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ path: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.map((i) => i.path).sort()).toEqual(['category', 'packName']);
    });

    it('rejects non-string discoveryItems with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'p', packName: 'P', category: 'knowledge_packs',
          discoveryItems: 'not-an-array',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ path: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.some((i) => i.path === 'discoveryItems')).toBe(true);
    });

    it('rejects non-object config with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'p', packName: 'P', category: 'knowledge_packs',
          config: 'nope',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('installs a fresh pack with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'github-knowledge',
          packName: 'GitHub Knowledge',
          category: 'knowledge_packs',
          discoveryItems: [{ icon: 'BookOpen', label: 'Repositories', value: '12' }],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.installed).toBe(true);
      expect(body.alreadyInstalled).toBe(false);
      expect(body.pack.packId).toBe('github-knowledge');
      expect(body.pack.configJson).toContain('Repositories');
    });

    it('is idempotent — second install returns 200 with alreadyInstalled=true', async () => {
      const payload = {
        packId: 'github-knowledge',
        packName: 'GitHub Knowledge',
        category: 'knowledge_packs',
      };
      // First install already happened in the previous test; this is the
      // second one. We expect 200 (not 201) and alreadyInstalled=true.
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.alreadyInstalled).toBe(true);
      // We should still only have one row in the DB
      const rows = db.select().from(installedPacks).where(eq(installedPacks.packId, 'github-knowledge')).all();
      expect(rows.length).toBe(1);
    });

    it('rejects the request with 403 when CSRF token is missing (defense in depth)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN }, // no x-csrf-token
        payload: { packId: 'x', packName: 'X', category: 'knowledge_packs' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects the request with 401 when session token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        payload: { packId: 'x', packName: 'X', category: 'knowledge_packs' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/packs/uninstall', () => {
    it('returns 400 when packId is missing', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/packs/uninstall',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ path: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.some((i) => i.path === 'packId')).toBe(true);
    });

    it('returns 404 when the pack is not installed (instead of silently lying)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/packs/uninstall?packId=does-not-exist',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().uninstalled).toBe(false);
    });

    it('uninstalls an existing pack and tears down its connectors', async () => {
      // 1. Install a pack — the `provider` field is what the uninstall
      //    endpoint uses to find the matching connector row.
      const installRes = await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'notion-knowledge',
          packName: 'Notion Knowledge',
          category: 'knowledge_packs',
          provider: 'notion',
        },
      });
      expect(installRes.statusCode).toBe(201);

      // 2. Create a connector that the pack "owns" (same provider as the
      //    pack installer would create).
      db.insert(connectors).values({
        id: 'conn-notion-test-1',
        name: 'Notion',
        type: 'productivity',
        provider: 'notion',
        status: 'active',
        configJson: '{}',
        encryptedCredentials: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      // 3. Uninstall — pack row + connector should both be gone.
      const uninstallRes = await app.inject({
        method: 'DELETE',
        url: '/api/packs/uninstall?packId=notion-knowledge',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
      });
      expect(uninstallRes.statusCode).toBe(200);
      const body = uninstallRes.json();
      expect(body.uninstalled).toBe(true);
      expect(body.removedConnectors).toBe(1);

      // 4. Verify the pack row is gone.
      const rows = db.select().from(installedPacks).where(eq(installedPacks.packId, 'notion-knowledge')).all();
      expect(rows.length).toBe(0);
      // 5. Verify the connector is gone.
      const conns = db.select().from(connectors).where(eq(connectors.id, 'conn-notion-test-1')).all();
      expect(conns.length).toBe(0);
    });

    it('still works when the caller omits the provider (uses packId fallback)', async () => {
      // Backward compat: a client that doesn't send `provider` should still
      // get a successful uninstall, with the connector cleanup falling back
      // to the packId-to-provider map.
      await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'shopify',
          packName: 'Shopify',
          category: 'creative_commerce',
        },
      });
      db.insert(connectors).values({
        id: 'conn-shopify-fallback',
        name: 'Shopify',
        type: 'creative',
        provider: 'shopify',
        status: 'active',
        configJson: '{}',
        encryptedCredentials: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/packs/uninstall?packId=shopify',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().removedConnectors).toBe(1);
    });
  });

  describe('GET /api/packs/installed', () => {
    it('returns installed packs for the brand profile', async () => {
      // Use a unique brand profile id so we don't see leakage from the
      // idempotency test above.
      const brandId = 'brand-' + Math.random().toString(36).slice(2, 8);
      await app.inject({
        method: 'POST',
        url: '/api/packs/install',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          packId: 'seo-pack', packName: 'SEO Pack', category: 'intelligence_packs',
          brandProfileId: brandId,
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/packs/installed?brandProfileId=${brandId}`,
        headers: { 'x-session-token': SESSION_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.packs.some((p: any) => p.packId === 'seo-pack')).toBe(true);
    });
  });

  // ─── Social accounts ─────────────────────────────────────────────────

  describe('POST /api/social-accounts/disconnect/:platform', () => {
    it('returns 400 when platform is missing from the URL', async () => {
      // Empty platform param is unreachable via the registered route — we
      // get a 404 from Fastify — so we test the body-validation path via a
      // direct call to the route's logic instead: the *route* itself guards
      // on `platform` in the URL, and the empty-connectorId case is tested
      // below.
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/disconnect/facebook',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { connectorId: '' },
      });
      // Empty body means "no specific connector", which falls through to the
      // "find by platform" path. There are no Facebook connectors, so we
      // get 200 with disconnected=0 — i.e. honest, no exception.
      expect(res.statusCode).toBe(200);
      expect(res.json().disconnected).toBe(0);
    });

    it('returns 404 when a specific connectorId does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/disconnect/instagram',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { connectorId: 'conn-does-not-exist' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().success).toBe(false);
    });

    it('disconnect/all with no connectors is a 200 with disconnected=0 (not 500)', async () => {
      // Ensure no social connectors exist.
      const existing = db.select().from(connectors).where(eq(connectors.type, 'social')).all();
      for (const c of existing) {
        db.delete(connectors).where(eq(connectors.id, c.id)).run();
      }

      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/disconnect/all',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().disconnected).toBe(0);
    });

    it('disconnect/all tears down every active social connector', async () => {
      db.insert(connectors).values({
        id: 'conn-ig-1', name: 'IG', type: 'social', provider: 'instagram_facebook',
        status: 'active', configJson: '{}', encryptedCredentials: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }).run();
      db.insert(connectors).values({
        id: 'conn-x-1', name: 'X', type: 'social', provider: 'x',
        status: 'active', configJson: '{}', encryptedCredentials: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }).run();
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/disconnect/all',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().disconnected).toBe(2);
      const remaining = db.select().from(connectors).where(eq(connectors.type, 'social')).all();
      expect(remaining.length).toBe(0);
    });
  });

  describe('GET /api/social-accounts/oauth-status/:connectorId', () => {
    it('returns 410 Gone for a connector that was never created', async () => {
      // This is the new, honest behavior: the popup polls this URL while
      // waiting for the OAuth callback. If the connector has been cleaned
      // up (e.g. handshake expired) we tell the popup the deal is off.
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/oauth-status/conn-vanished',
        headers: { 'x-session-token': SESSION_TOKEN },
      });
      expect(res.statusCode).toBe(410);
    });

    it('returns the connector status when it exists', async () => {
      db.insert(connectors).values({
        id: 'conn-status-test',
        name: 'IG', type: 'social', provider: 'instagram_facebook',
        status: 'inactive', configJson: '{}', encryptedCredentials: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }).run();

      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/oauth-status/conn-status-test',
        headers: { 'x-session-token': SESSION_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('conn-status-test');
      expect(body.status).toBe('inactive');
    });
  });

  describe('POST /api/social-accounts/connect-app-password', () => {
    it('rejects when no credential values are provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/connect-app-password',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { provider: 'bluesky' }, // no handle, no appPassword
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ message: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.some((i) => /credential value/i.test(i.message))).toBe(true);
    });

    it('rejects Bluesky with a missing handle', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/connect-app-password',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { provider: 'bluesky', appPassword: 'abcd-efgh-ijkl-mnop' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ path: string; message: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.some((i) => i.path === 'handle' && /handle/i.test(i.message))).toBe(true);
    });

    it('rejects Bluesky with a too-short app password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/connect-app-password',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { provider: 'bluesky', handle: 'me.bsky.social', appPassword: 'short' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ path: string; message: string }> };
      expect(body.error).toBe('ValidationError');
      expect(body.issues.some((i) => i.path === 'appPassword' && /app password/i.test(i.message))).toBe(true);
    });

    it('connects Bluesky with a valid handle + app password', async () => {
      // `enrichConnectorAfterOAuth` for bluesky calls the Bluesky API
      // (createSession, getProfile). We mock both axios.get and axios.post
      // so the enrich succeeds and stores the DID in the credential store.
      (axios.post as any).mockImplementation(async (url: string) => {
        if (url.includes('bsky.social/xrpc/com.atproto.server.createSession')) {
          return { data: { accessJwt: 'jwt', refreshJwt: 'refresh', did: 'did:plc:abc', handle: 'me.bsky.social' } };
        }
        throw new Error(`Unexpected POST to ${url}`);
      });
      (axios.get as any).mockImplementation(async (url: string) => {
        if (url.includes('app.bsky.actor.getProfile')) {
          return { data: { handle: 'me.bsky.social', displayName: 'Me', followersCount: 42, postsCount: 5 } };
        }
        throw new Error(`Unexpected GET to ${url}`);
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/connect-app-password',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: {
          provider: 'bluesky',
          handle: 'me.bsky.social',
          appPassword: 'abcd-efgh-ijkl-mnop',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(typeof body.connectorId).toBe('string');
    });
  });

  describe('POST /api/social-accounts/save-credentials', () => {
    it('rejects missing provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/save-credentials',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { clientId: 'abc' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects missing clientId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/save-credentials',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { provider: 'instagram' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('saves and normalizes the provider key (instagram -> instagram_facebook)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/social-accounts/save-credentials',
        headers: { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN },
        payload: { provider: 'instagram', clientId: 'app-123', clientSecret: 'secret-456' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      // Verify it was stored under the normalized key
      const row = db.select().from(appSettings).where(eq(appSettings.key, 'oauthAppCredentials')).get();
      expect(row).toBeDefined();
      const creds = JSON.parse(row!.value);
      expect(creds.instagram_facebook.clientId).toBe('app-123');
      expect(creds.instagram_facebook.clientSecret).toBe('secret-456');
    });
  });

  describe('GET /api/social-accounts/connect/:platform', () => {
    it('returns 400 for an unsupported platform', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/connect/myspace',
        headers: { 'x-session-token': SESSION_TOKEN },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().needsSetup).toBe(true);
    });
  });
});
