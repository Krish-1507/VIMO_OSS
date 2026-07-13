/**
 * Auth / token renewal — the "auth/renew" critical path.
 *
 * When a connector's short-lived token expires, VIMO must silently exchange it
 * for a fresh one and persist it. If this breaks, every "Ready" integration
 * silently dies. We mock the *HTTP* boundary (axios) and assert:
 *   - Instagram long-lived token exchange refreshes + persists the token
 *   - missing/invalid credentials fail gracefully (return false, never throw)
 *   - the generic OAuth refreshAccessToken renews and returns the new token
 *
 * Only the external API is mocked; the credential store + DB are real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

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

import { db } from '../db';
import { connectors, appSettings } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import { refreshInstagramToken } from '../services/connectorHealthService';
import { refreshAccessToken } from '../lib/oauthManager';

function seedConnector(provider: string, creds: Record<string, string>, status = 'active') {
  return (async () => {
    const id = `conn_${provider}_${Math.random().toString(36).slice(2)}`;
    db.insert(connectors)
      .values({
        id,
        name: provider,
        type: 'social',
        provider,
        status,
        configJson: '{}',
        encryptedCredentials: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    for (const [k, v] of Object.entries(creds)) {
      await credentialStore.storeCredential(id, k, v);
    }
    return id;
  })();
}

function jsonResponse(body: unknown) {
  return { data: body, status: 200 };
}

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  db.delete(appSettings).run();
});

describe('Instagram token renewal (connectorHealthService)', () => {
  it('exchanges the short-lived token for a long-lived one and persists it', async () => {
    const id = await seedConnector('instagram', {
      accessToken: 'SHORT_LIVED',
      appId: 'APPID',
      appSecret: 'APPSECRET',
    });
    http.get.mockResolvedValue(jsonResponse({ access_token: 'LONG_LIVED' }));

    const ok = await refreshInstagramToken(id);

    expect(ok).toBe(true);
    expect(http.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/oauth/access_token',
      expect.objectContaining({ params: expect.objectContaining({ fb_exchange_token: 'SHORT_LIVED' }) }),
    );
    const stored = await credentialStore.getCredential(id, 'accessToken');
    expect(stored).toBe('LONG_LIVED');
    const row = db.select().from(connectors).where(eq(connectors.id, id)).get();
    expect(row?.status).toBe('active');
  });

  it('returns false (never throws) when app credentials are missing', async () => {
    const id = await seedConnector('instagram', { accessToken: 'SHORT_LIVED' });
    const ok = await refreshInstagramToken(id);
    expect(ok).toBe(false);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns false when the provider API errors', async () => {
    const id = await seedConnector('instagram', {
      accessToken: 'SHORT_LIVED',
      appId: 'APPID',
      appSecret: 'APPSECRET',
    });
    http.get.mockRejectedValue(new Error('invalid_grant'));
    const ok = await refreshInstagramToken(id);
    expect(ok).toBe(false);
  });
});

describe('Generic OAuth renewal (oauthManager.refreshAccessToken)', () => {
  it('renews a token for a configured provider and returns the new token', async () => {
    // LinkedIn is a "guided" provider: its credentials live in app_settings.
    db.insert(appSettings)
      .values({
        key: 'oauthAppCredentials',
        value: JSON.stringify({ linkedin: { clientId: 'LI_ID', clientSecret: 'LI_SECRET' } }),
        updatedAt: new Date().toISOString(),
      })
      .run();

    http.post.mockResolvedValue(jsonResponse({ access_token: 'NEW_OAUTH_TOKEN', expires_in: 3600 }));

    const result = await refreshAccessToken('linkedin', 'LI_REFRESH');

    expect(result.accessToken).toBe('NEW_OAUTH_TOKEN');
    expect(result.expiresIn).toBe(3600);
    expect(http.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('refresh_token=LI_REFRESH'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }) }),
    );
  });

  it('throws a clear error for an unknown provider', async () => {
    await expect(refreshAccessToken('nope', 'x')).rejects.toThrow(/Unknown OAuth provider/);
  });
});
