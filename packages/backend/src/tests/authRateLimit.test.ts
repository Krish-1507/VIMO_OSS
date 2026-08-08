/**
 * Auth endpoint rate limiting.
 *
 * The global limiter in index.ts allowlisted the entire `/api/auth` prefix, so
 * only `verify` was throttled (at 5/min) and `setup`, `reset-pin`, `renew`, and
 * `logout` had no limit at all. Brute-forcing a 4-digit PIN was trivial.
 *
 * These tests register the same rate-limit plugin the server does, so the
 * per-route `config.rateLimit` values in routes/auth.ts are exercised for real
 * rather than asserted from a config object.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import authRoutes from '../routes/auth';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPin } from '../lib/pin';

/** Mirrors the production wiring: global limiter + per-route overrides. */
async function makeRateLimitedApp() {
  const app = Fastify();
  await app.register(rateLimit, {
    max: 3000,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/api/health',
  });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

/** Fire n requests and return the status codes in order. */
async function hammer(
  app: Awaited<ReturnType<typeof makeRateLimitedApp>>,
  url: string,
  payload: unknown,
  n: number,
): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await app.inject({ method: 'POST', url, payload: payload as any });
    codes.push(res.statusCode);
  }
  return codes;
}

describe('auth rate limiting', () => {
  beforeEach(async () => {
    for (const key of ['session_token', 'pin_hash', 'app_config', 'pin_reset_code']) {
      db.delete(appSettings).where(eq(appSettings.key, key)).run();
    }
    db.insert(appSettings)
      .values({
        key: 'pin_hash',
        value: await hashPin('1111'),
        updatedAt: new Date().toISOString(),
      })
      .run();
  });

  /** The plan's stated acceptance criterion: the 11th failed verify is refused. */
  it('429s the 11th failed verify inside one minute', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/verify', { pin: '0000' }, 11);

    expect(codes.slice(0, 10).every((c) => c === 401), `got ${codes.join(',')}`).toBe(true);
    expect(codes[10]).toBe(429);
    await app.close();
    // 11 sequential bcrypt comparisons; generous headroom for slow CI runners.
  }, 30_000);

  it('throttles setup', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/setup', { pin: '1234' }, 6);

    expect(codes[5]).toBe(429);
    await app.close();
  });

  /**
   * The tightest limit in the file: this endpoint is unauthenticated by
   * necessity, so it is the one an attacker would hammer to farm codes.
   */
  it('throttles reset-pin/request hardest', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/reset-pin/request', {}, 4);

    expect(codes.slice(0, 3).every((c) => c === 200), `got ${codes.join(',')}`).toBe(true);
    expect(codes[3]).toBe(429);
    await app.close();
  });

  it('throttles reset-pin itself', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/reset-pin', { pin: '9999' }, 6);

    // Unauthorised (401) until the limiter takes over.
    expect(codes.slice(0, 5).every((c) => c === 401), `got ${codes.join(',')}`).toBe(true);
    expect(codes[5]).toBe(429);
    await app.close();
  });

  it('throttles renew', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/renew', {}, 21);

    expect(codes[20]).toBe(429);
    await app.close();
  });

  it('throttles logout', async () => {
    const app = await makeRateLimitedApp();
    const codes = await hammer(app, '/api/auth/logout', {}, 21);

    expect(codes[20]).toBe(429);
    await app.close();
  });

  it('does not let a 429 leak into a successful login', async () => {
    const app = await makeRateLimitedApp();
    // Nine failures leaves one attempt inside the 10/min budget.
    await hammer(app, '/api/auth/verify', { pin: '0000' }, 9);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: '1111' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  }, 30_000);
});
