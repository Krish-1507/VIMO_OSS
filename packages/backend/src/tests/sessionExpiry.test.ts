/**
 * Session expiry parsing — the NaN bypass.
 *
 * Sessions are stored as an encrypted `token|expiry` string. `Number(expiry)`
 * returns NaN for any malformed value, and every comparison against NaN is
 * false — so `Date.now() > session.expiry` used to evaluate to false forever,
 * producing a session token that never expired.
 *
 * These tests lock the fix at both layers: `decryptSession` refuses to return
 * a session it cannot date, and `requireAuth` fails closed if it somehow does.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '../lib/credentialStore';
import { decryptSession } from '../lib/session';
import { requireAuth } from '../middleware/auth';

const TOKEN = 'a'.repeat(64);

/** Write a raw `token|expiry` payload to app_settings, encrypted at rest. */
async function seedSession(raw: string): Promise<void> {
  const value = await encrypt(raw);
  db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
  db.insert(appSettings)
    .values({ key: 'session_token', value, updatedAt: new Date().toISOString() })
    .run();
}

/** Minimal app whose only guarded route is protected by requireAuth. */
function makeGuardedApp() {
  const app = Fastify();
  app.addHook('onRequest', requireAuth);
  app.get('/guarded', async () => ({ ok: true }));
  return app;
}

describe('session expiry parsing', () => {
  beforeEach(() => {
    db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
  });

  describe('decryptSession', () => {
    it('returns null when the expiry is not a number', async () => {
      await seedSession(`${TOKEN}|not-a-number`);
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();

      expect(await decryptSession(row)).toBeNull();
    });

    it('returns null when the expiry is missing entirely', async () => {
      await seedSession(TOKEN);
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();

      expect(await decryptSession(row)).toBeNull();
    });

    it('returns null when the expiry is present but empty', async () => {
      await seedSession(`${TOKEN}|`);
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();

      expect(await decryptSession(row)).toBeNull();
    });

    it('returns null for a non-finite expiry', async () => {
      await seedSession(`${TOKEN}|Infinity`);
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();

      expect(await decryptSession(row)).toBeNull();
    });

    it('parses a well-formed session', async () => {
      const expiry = Date.now() + 60_000;
      await seedSession(`${TOKEN}|${expiry}`);
      const row = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();

      expect(await decryptSession(row)).toEqual({ token: TOKEN, expiry });
    });
  });

  describe('requireAuth', () => {
    it('rejects a malformed expiry with 401 instead of granting access', async () => {
      await seedSession(`${TOKEN}|not-a-number`);
      const app = makeGuardedApp();

      const res = await app.inject({
        method: 'GET',
        url: '/guarded',
        headers: { 'x-session-token': TOKEN },
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('rejects an expiry-less token with 401', async () => {
      await seedSession(TOKEN);
      const app = makeGuardedApp();

      const res = await app.inject({
        method: 'GET',
        url: '/guarded',
        headers: { 'x-session-token': TOKEN },
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a genuinely expired session with 401', async () => {
      await seedSession(`${TOKEN}|${Date.now() - 1000}`);
      const app = makeGuardedApp();

      const res = await app.inject({
        method: 'GET',
        url: '/guarded',
        headers: { 'x-session-token': TOKEN },
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('allows a valid unexpired session', async () => {
      await seedSession(`${TOKEN}|${Date.now() + 60_000}`);
      const app = makeGuardedApp();

      const res = await app.inject({
        method: 'GET',
        url: '/guarded',
        headers: { 'x-session-token': TOKEN },
      });

      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe('GET /api/auth/status', () => {
    it('reports isAuthenticated=false for a malformed expiry', async () => {
      const { default: authRoutes } = await import('../routes/auth');
      await seedSession(`${TOKEN}|not-a-number`);

      const app = Fastify();
      app.register(authRoutes);

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/status',
        headers: { 'x-session-token': TOKEN },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { isAuthenticated: boolean }).isAuthenticated).toBe(false);
      await app.close();
    });
  });
});
