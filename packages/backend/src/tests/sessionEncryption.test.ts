/**
 * Session token encryption at rest.
 *
 * The session token used to be stored as plaintext `token|expiry` in
 * app_settings. It is now AES-256-GCM encrypted (same scheme as credentials).
 * This test proves the stored value is not the raw token and decrypts back
 * to `token|<expiry>`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../routes/auth';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '../lib/credentialStore';

function makeApp() {
  const app = Fastify();
  // rate-limit is intentionally NOT registered here so /api/auth/verify isn't throttled in tests
  app.register(authRoutes);
  return app;
}

describe('Session token encryption at rest', () => {
  beforeEach(() => {
    db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
    db.delete(appSettings).where(eq(appSettings.key, 'pin_hash')).run();
  });

  it('stores the session token encrypted, not as plaintext', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { pin: '1234' } });
    const verify = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { pin: '1234' } });

    expect(verify.statusCode).toBe(200);
    const { token } = verify.json() as { token: string };
    expect(token).toBeTruthy();

    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
    expect(row).toBeTruthy();

    // The persisted value must NOT contain the raw token (i.e. it's encrypted).
    expect(row!.value).not.toContain(token);
    // And it must decrypt back to exactly `token|<expiry>`.
    const decrypted = await decrypt(row!.value);
    expect(decrypted.startsWith(`${token}|`)).toBe(true);

    await app.close();
  });

  it('rejects a wrong PIN and never writes a session', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { pin: '1234' } });
    const bad = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { pin: '0000' } });

    expect(bad.statusCode).toBe(401);
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
    expect(row).toBeFalsy();

    await app.close();
  });
});
