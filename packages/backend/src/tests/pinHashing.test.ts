/**
 * PIN hashing — bcrypt, with transparent upgrade from the legacy SHA-256 scheme.
 *
 * PINs were stored as a single unsalted SHA-256 round. Existing installations
 * must keep working after the switch to bcrypt, so a legacy digest still
 * verifies and is re-hashed in place on the next successful login.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import Fastify from 'fastify';
import authRoutes from '../routes/auth';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPin, verifyPin, isLegacyHash, BCRYPT_COST } from '../lib/pin';

const legacySha256 = (pin: string) =>
  crypto.createHash('sha256').update(pin).digest('hex');

function makeApp() {
  const app = Fastify();
  app.register(authRoutes);
  return app;
}

async function readPinHash(): Promise<string | undefined> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'pin_hash'))
    .get();
  return row?.value;
}

describe('lib/pin', () => {
  it('produces a $2b$ hash at the configured cost', async () => {
    const hash = await hashPin('1234');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    expect(hash).not.toBe(legacySha256('1234'));
  });

  it('salts: the same PIN hashes differently every time', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
    expect((await verifyPin('1234', a)).ok).toBe(true);
    expect((await verifyPin('1234', b)).ok).toBe(true);
  });

  it('verifies a correct PIN and rejects a wrong one', async () => {
    const hash = await hashPin('4321');
    expect(await verifyPin('4321', hash)).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPin('1234', hash)).ok).toBe(false);
  });

  it('verifies a legacy SHA-256 digest and asks for a rehash', async () => {
    const legacy = legacySha256('1234');
    expect(isLegacyHash(legacy)).toBe(true);
    expect(await verifyPin('1234', legacy)).toEqual({ ok: true, needsRehash: true });
  });

  it('rejects a wrong PIN against a legacy digest', async () => {
    const legacy = legacySha256('1234');
    expect(await verifyPin('9999', legacy)).toEqual({ ok: false, needsRehash: false });
  });

  it('accepts an uppercase legacy digest', async () => {
    const legacy = legacySha256('1234').toUpperCase();
    expect((await verifyPin('1234', legacy)).ok).toBe(true);
  });

  it('flags a bcrypt hash at a different cost for rehashing', async () => {
    // A cost-4 hash of "1234", i.e. what an older/cheaper setting produced.
    const bcryptjs = (await import('bcryptjs')).default;
    const weak = await bcryptjs.hash('1234', 4);
    expect(await verifyPin('1234', weak)).toEqual({ ok: true, needsRehash: true });
  });

  it('fails closed on malformed, empty, and corrupt stored values', async () => {
    expect(await verifyPin('1234', '')).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPin('', await hashPin('1234'))).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPin('1234', 'not-a-hash')).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPin('1234', '$2b$12$truncated')).toEqual({ ok: false, needsRehash: false });
    // 64 chars but not hex — must not be mistaken for a legacy digest.
    expect(await verifyPin('1234', 'z'.repeat(64))).toEqual({ ok: false, needsRehash: false });
  });
});

describe('auth routes — PIN storage', () => {
  beforeEach(() => {
    db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
    db.delete(appSettings).where(eq(appSettings.key, 'pin_hash')).run();
    db.delete(appSettings).where(eq(appSettings.key, 'app_config')).run();
  });

  it('stores a bcrypt hash on setup, never a raw sha256', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { pin: '1234' },
    });

    expect(res.statusCode).toBe(200);
    const stored = await readPinHash();
    expect(stored).toMatch(/^\$2[aby]\$/);
    expect(stored).not.toBe(legacySha256('1234'));
    await app.close();
  });

  /** The migration path that must not break for existing users. */
  it('lets a legacy sha256 user log in, and upgrades their hash in place', async () => {
    const now = new Date().toISOString();
    db.insert(appSettings)
      .values({ key: 'pin_hash', value: legacySha256('5678'), updatedAt: now })
      .run();

    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '5678' },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { token: string }).token).toBeTruthy();

    // The stored hash is upgraded as a side effect of the successful login.
    const upgraded = await readPinHash();
    expect(upgraded).toMatch(/^\$2[aby]\$/);
    expect(upgraded).not.toBe(legacySha256('5678'));

    // ...and the upgraded hash still accepts the same PIN.
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '5678' },
    });
    expect(again.statusCode).toBe(200);
    await app.close();
  });

  it('does not upgrade the hash when the legacy PIN is wrong', async () => {
    const now = new Date().toISOString();
    const legacy = legacySha256('5678');
    db.insert(appSettings).values({ key: 'pin_hash', value: legacy, updatedAt: now }).run();

    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '0000' },
    });

    expect(res.statusCode).toBe(401);
    expect(await readPinHash()).toBe(legacy);
    await app.close();
  });

  it('rejects a non-string PIN with 400 rather than crashing', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { pin: 1234 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'ValidationError' });
    await app.close();
  });

  it('rejects PINs that are too short, too long, or non-numeric', async () => {
    const app = makeApp();
    for (const pin of ['123', '123456789', 'abcd', '', '12 34']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { pin },
      });
      expect(res.statusCode, `PIN ${JSON.stringify(pin)} should be rejected`).toBe(400);
    }
    await app.close();
  });

  it('rejects a completely absent body with 400', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
