/**
 * Changing the PIN while signed in (`/api/auth/update-pin`) and the reset code
 * being returned to the Setup Assistant (`/api/auth/reset-pin/request`).
 *
 * update-pin exists for the "forgot my PIN" flow: a signed-in user who
 * remembers their current PIN can change it in Settings. It must reject
 * requests without a valid session, reject a wrong current PIN, and invalidate
 * every session afterwards so old tokens cannot outlive a credential change.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../routes/auth';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { encryptSession } from '../lib/session';
import { hashPin, verifyPin } from '../lib/pin';

function makeApp() {
  const app = Fastify();
  app.register(authRoutes);
  return app;
}

async function seedSession(token: string, expiryMs = 60_000): Promise<void> {
  const encrypted = await encryptSession(token, Date.now() + expiryMs);
  const now = new Date().toISOString();
  db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
  db.insert(appSettings)
    .values({ key: 'session_token', value: encrypted, updatedAt: now })
    .run();
}

async function seedPin(pin: string): Promise<void> {
  const now = new Date().toISOString();
  db.delete(appSettings).where(eq(appSettings.key, 'pin_hash')).run();
  db.insert(appSettings)
    .values({ key: 'pin_hash', value: await hashPin(pin), updatedAt: now })
    .run();
}

describe('POST /api/auth/reset-pin/request — reset code in the response', () => {
  it('returns the one-time code so the Setup Assistant can show it', async () => {
    const app = makeApp();
    try {
      // Avoid printing a banner during the test run.
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const res = await app.inject({ method: 'POST', url: '/api/auth/reset-pin/request', payload: {} });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.code).toMatch(/^\d{8}$/);
      expect(body.expiresAt).toBeGreaterThan(Date.now());

      // The code in the response must actually work.
      const resetRes = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-pin',
        payload: { pin: '9876', code: body.code },
      });
      expect(resetRes.statusCode).toBe(200);

      spy.mockRestore();
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/auth/update-pin — change the PIN while signed in', () => {
  beforeEach(async () => {
    await seedPin('1234');
  });

  afterEach(() => {
    db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
    db.delete(appSettings).where(eq(appSettings.key, 'pin_hash')).run();
  });

  it('rejects requests without a valid session', async () => {
    const app = makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/update-pin',
        payload: { currentPin: '1234', newPin: '5678' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('NOT_AUTHENTICATED');
    } finally {
      await app.close();
    }
  });

  it('rejects a wrong current PIN even with a valid session', async () => {
    await seedSession('token-abc');
    const app = makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/update-pin',
        headers: { 'x-session-token': 'token-abc' },
        payload: { currentPin: '0000', newPin: '5678' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_PIN');

      // The PIN must not have changed.
      const row = db.select().from(appSettings).where(eq(appSettings.key, 'pin_hash')).get();
      const { ok } = await verifyPin('1234', row?.value ?? '');
      expect(ok).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid new PIN shape (schema validation)', async () => {
    await seedSession('token-abc');
    const app = makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/update-pin',
        headers: { 'x-session-token': 'token-abc' },
        payload: { currentPin: '1234', newPin: 'not-digits' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('changes the PIN and invalidates all sessions', async () => {
    await seedSession('token-abc');
    const app = makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/update-pin',
        headers: { 'x-session-token': 'token-abc' },
        payload: { currentPin: '1234', newPin: '5678' },
      });
      expect(res.statusCode).toBe(200);

      // Old PIN no longer works, new one does.
      const row = db.select().from(appSettings).where(eq(appSettings.key, 'pin_hash')).get();
      const oldPin = await verifyPin('1234', row?.value ?? '');
      expect(oldPin.ok).toBe(false);
      const newPin = await verifyPin('5678', row?.value ?? '');
      expect(newPin.ok).toBe(true);

      // Sessions were cleared: the old token is now rejected by verify flow.
      const sessionRow = db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
      expect(sessionRow).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
