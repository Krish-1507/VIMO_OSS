/**
 * PIN reset authorisation.
 *
 * `POST /api/auth/reset-pin` used to accept ANY request. There was no session
 * check, no code, no old PIN — the only gate was the string "RESET" typed into
 * a browser input, which curl simply skips. Anyone who could reach the port
 * could take over the installation.
 *
 * It now requires either a valid session or a single-use code delivered
 * out-of-band (server console + a file next to the database).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import Fastify from 'fastify';
import authRoutes from '../routes/auth';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { encryptSession } from '../lib/session';
import { hashPin } from '../lib/pin';
import { RESET_CODE_KEY, resetCodeFilePath, generateResetCode } from '../lib/resetCode';

function makeApp() {
  const app = Fastify();
  app.register(authRoutes);
  return app;
}

/** Capture the code from the banner printed to stdout. */
function captureCode(): { read: () => string | null; restore: () => void } {
  let captured: string | null = null;
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => {
    const text = String(chunk);
    const match = text.match(/^\s{6}(\d{8})\s*$/m);
    if (match) captured = match[1];
    return true;
  }) as any);

  return { read: () => captured, restore: () => spy.mockRestore() };
}

async function requestCode(app: ReturnType<typeof makeApp>): Promise<string> {
  const capture = captureCode();
  try {
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset-pin/request', payload: {} });
    expect(res.statusCode).toBe(200);
    const code = capture.read();
    expect(code, 'no reset code was printed to the console').toBeTruthy();
    return code!;
  } finally {
    capture.restore();
  }
}

async function seedValidSession(token: string): Promise<void> {
  const encrypted = await encryptSession(token, Date.now() + 60_000);
  const now = new Date().toISOString();
  db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
  db.insert(appSettings)
    .values({ key: 'session_token', value: encrypted, updatedAt: now })
    .run();
}

async function currentPinHash(): Promise<string | undefined> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'pin_hash'))
    .get();
  return row?.value;
}

describe('POST /api/auth/reset-pin', () => {
  beforeEach(async () => {
    for (const key of ['session_token', 'pin_hash', 'app_config', RESET_CODE_KEY]) {
      db.delete(appSettings).where(eq(appSettings.key, key)).run();
    }
    const now = new Date().toISOString();
    db.insert(appSettings)
      .values({ key: 'pin_hash', value: await hashPin('1111'), updatedAt: now })
      .run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const p = resetCodeFilePath();
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  });

  /** The headline vulnerability. */
  it('returns 401 with no session and no code', async () => {
    const app = makeApp();
    const before = await currentPinHash();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'RESET_NOT_AUTHORISED' });
    // The PIN must be completely untouched.
    expect(await currentPinHash()).toBe(before);
    await app.close();
  });

  it('returns 401 for a wrong code', async () => {
    const app = makeApp();
    await requestCode(app);
    const before = await currentPinHash();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999', code: '00000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(await currentPinHash()).toBe(before);
    await app.close();
  });

  it('returns 401 for an invalid session token', async () => {
    const app = makeApp();
    await seedValidSession('the-real-token');

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999' },
      headers: { 'x-session-token': 'a-forged-token' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 for an expired session token', async () => {
    const app = makeApp();
    const encrypted = await encryptSession('expired-token', Date.now() - 1000);
    const now = new Date().toISOString();
    db.insert(appSettings)
      .values({ key: 'session_token', value: encrypted, updatedAt: now })
      .run();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999' },
      headers: { 'x-session-token': 'expired-token' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('accepts a valid session and sets the new PIN', async () => {
    const app = makeApp();
    await seedValidSession('valid-token');

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999' },
      headers: { 'x-session-token': 'valid-token' },
    });

    expect(res.statusCode).toBe(200);
    // New PIN works.
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '9999' },
    });
    expect(verify.statusCode).toBe(200);
    await app.close();
  });

  it('accepts a valid one-time code and sets the new PIN', async () => {
    const app = makeApp();
    const code = await requestCode(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999', code },
    });

    expect(res.statusCode).toBe(200);
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '9999' },
    });
    expect(verify.statusCode).toBe(200);
    await app.close();
  });

  it('burns the code after one use', async () => {
    const app = makeApp();
    const code = await requestCode(app);

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999', code },
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '7777', code },
    });
    expect(replay.statusCode).toBe(401);

    // The replay must not have changed anything.
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '9999' },
    });
    expect(verify.statusCode).toBe(200);
    await app.close();
  });

  it('rejects an expired code', async () => {
    const app = makeApp();
    const code = await requestCode(app);

    // Rewind the stored expiry rather than waiting 10 minutes.
    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, RESET_CODE_KEY))
      .get();
    const parsed = JSON.parse(row!.value);
    parsed.expiry = Date.now() - 1;
    db.update(appSettings)
      .set({ value: JSON.stringify(parsed), updatedAt: new Date().toISOString() })
      .where(eq(appSettings.key, RESET_CODE_KEY))
      .run();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999', code },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('never returns the code in the request response', async () => {
    const app = makeApp();
    const capture = captureCode();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin/request',
      payload: {},
    });
    const code = capture.read();
    capture.restore();

    expect(res.statusCode).toBe(200);
    expect(code).toBeTruthy();
    expect(res.body).not.toContain(code!);
    await app.close();
  });

  it('stores the code hashed, not in plaintext', async () => {
    const app = makeApp();
    const code = await requestCode(app);

    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, RESET_CODE_KEY))
      .get();

    expect(row).toBeTruthy();
    expect(row!.value).not.toContain(code);
    expect(JSON.parse(row!.value).hash).toMatch(/^\$2[aby]\$/);
    await app.close();
  });

  it('clears the session so the user must log in again', async () => {
    const app = makeApp();
    await seedValidSession('valid-token');

    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999' },
      headers: { 'x-session-token': 'valid-token' },
    });

    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'session_token'))
      .get();
    expect(row).toBeFalsy();
    await app.close();
  });

  it('validates the new PIN before authorising anything', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: 'abcd' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'ValidationError' });
    await app.close();
  });

  it('rejects a malformed code shape with 400', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-pin',
      payload: { pin: '9999', code: 'not-digits' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('generateResetCode', () => {
  it('always produces exactly 8 digits', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateResetCode()).toMatch(/^\d{8}$/);
    }
  });

  it('does not repeat trivially', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateResetCode());
    // Birthday collisions in 200 draws from 10^8 are vanishingly unlikely.
    expect(seen.size).toBeGreaterThan(195);
  });
});
