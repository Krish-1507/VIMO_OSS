import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { encryptSession, decryptSession } from '../lib/session';
import { hashPin, verifyPin } from '../lib/pin';
import { issueResetCode, consumeResetCode, clearResetCode } from '../lib/resetCode';
import { parseBody } from '../lib/validate';
import { createLogger } from '../lib/logger';
import {
  AuthSetupSchema,
  AuthVerifySchema,
  AuthResetPinSchema,
} from '../../../shared/src/schemas/requests/auth';

const log = createLogger('auth');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Per-route rate limits.
 *
 * The global limiter in index.ts used to allowlist the whole `/api/auth`
 * prefix, so everything except `verify` was completely unthrottled and open to
 * brute force. These are the replacement, and they are deliberately tightest
 * on the endpoints that mint or change credentials.
 */
const limit = (max: number, timeWindow = '1 minute') => ({
  config: { rateLimit: { max, timeWindow } },
});

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Persist a fresh session and return the plaintext token for the client. */
async function issueSession(): Promise<{ token: string; expiry: number }> {
  const token = generateSessionToken();
  const expiry = Date.now() + SESSION_TTL_MS;
  const encrypted = await encryptSession(token, expiry);
  const now = new Date().toISOString();

  await db
    .insert(appSettings)
    .values({ key: 'session_token', value: encrypted, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: encrypted, updatedAt: now } });

  return { token, expiry };
}

/** Write a PIN hash, creating or replacing the stored value. */
async function storePinHash(pinHash: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: 'pin_hash', value: pinHash, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: pinHash, updatedAt: now } });
}

/** Mark setup as complete without clobbering unrelated app_config keys. */
async function markSetupComplete(): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'app_config'))
    .get();

  let config: Record<string, unknown> = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing.value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed;
    } catch {
      log.warn('app_config was not valid JSON; rewriting it');
    }
  }

  config.isSetupComplete = true;
  const value = JSON.stringify(config);

  await db
    .insert(appSettings)
    .values({ key: 'app_config', value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

/** True when the request carries the current, unexpired session token. */
async function hasValidSession(clientToken: string): Promise<boolean> {
  if (!clientToken) return false;
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'session_token'))
    .get();
  const session = await decryptSession(row);
  return (
    !!session &&
    session.token === clientToken &&
    Number.isFinite(session.expiry) &&
    Date.now() <= session.expiry
  );
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/setup', limit(5), async (request, reply) => {
    try {
      const body = parseBody(AuthSetupSchema, request, reply);
      if (!body) return;

      await storePinHash(await hashPin(body.pin));
      await markSetupComplete();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // 10/min: high enough that a user fat-fingering their PIN a few times is not
  // locked out, low enough that guessing a 4-digit PIN takes ~17 hours.
  app.post('/api/auth/verify', limit(10), async (request, reply) => {
    try {
      const body = parseBody(AuthVerifySchema, request, reply);
      if (!body) return;

      const pinRow = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'pin_hash'))
        .get();
      if (!pinRow) {
        return reply
          .status(401)
          .send({ code: 'NO_PIN_SET', message: 'No PIN has been set yet. Please complete setup first.' });
      }

      const { ok, needsRehash } = await verifyPin(body.pin, pinRow.value);
      if (!ok) {
        return reply
          .status(401)
          .send({ code: 'INVALID_PIN', message: 'Incorrect PIN. Please try again.' });
      }

      // Transparent upgrade: existing installs stored an unsalted SHA-256
      // digest. The first correct PIN after this ships replaces it with bcrypt,
      // so nobody has to reset anything.
      if (needsRehash) {
        await storePinHash(await hashPin(body.pin));
        log.info('Upgraded the stored PIN hash to the current algorithm');
      }

      const { token } = await issueSession();
      return { success: true, token };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Renew session token (extend by 24h)
  app.post('/api/auth/renew', limit(20), async (request, reply) => {
    try {
      const clientToken = (request.headers['x-session-token'] as string) || '';
      const sessionRow = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'session_token'))
        .get();
      const session = await decryptSession(sessionRow);
      if (!session) {
        return reply.status(401).send(formatError(new Error('No session found')));
      }

      if (session.token !== clientToken) {
        return reply.status(401).send(formatError(new Error('Invalid session token')));
      }

      // An expired session must not be renewable, otherwise the 24h TTL is
      // decorative: anyone holding an old token could extend it forever.
      if (!Number.isFinite(session.expiry) || Date.now() > session.expiry) {
        return reply.status(401).send(formatError(new Error('Session expired')));
      }

      const { token, expiry } = await issueSession();
      return { success: true, token, expiresAt: expiry };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  /**
   * Ask the server to issue a one-time PIN reset code.
   *
   * The code is printed to the terminal running VIMO and written next to the
   * database — never returned in this response. Possession of it proves access
   * to the machine, which is the trust boundary for a self-hosted app.
   *
   * 3/min: this endpoint is unauthenticated by necessity, so it is the tightest
   * limit in the file.
   */
  app.post('/api/auth/reset-pin/request', limit(3), async (request, reply) => {
    try {
      const { filePath, expiresAt } = await issueResetCode();
      log.warn('A PIN reset code was requested', { ip: request.ip });

      return {
        success: true,
        expiresAt,
        filePath,
        message: filePath
          ? `A reset code was printed in the terminal running VIMO, and saved to ${filePath}.`
          : 'A reset code was printed in the terminal running VIMO.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  /**
   * Set a new PIN.
   *
   * Requires EITHER a valid session (a signed-in user changing their PIN) OR a
   * one-time code from `/api/auth/reset-pin/request` (a locked-out user). With
   * neither, this used to accept any request at all — the only check was the
   * word "RESET" typed into the browser, which curl ignores.
   */
  app.post('/api/auth/reset-pin', limit(5), async (request, reply) => {
    try {
      const body = parseBody(AuthResetPinSchema, request, reply);
      if (!body) return;

      const clientToken = (request.headers['x-session-token'] as string) || '';
      const authorisedBySession = await hasValidSession(clientToken);
      const authorisedByCode = authorisedBySession
        ? false
        : await consumeResetCode(body.code ?? '');

      if (!authorisedBySession && !authorisedByCode) {
        log.warn('Rejected an unauthorised PIN reset attempt', {
          ip: request.ip,
          codeSupplied: Boolean(body.code),
        });
        return reply.status(401).send({
          code: 'RESET_NOT_AUTHORISED',
          message:
            'A valid session or a one-time reset code is required. Request a code, then check the terminal running VIMO.',
        });
      }

      await storePinHash(await hashPin(body.pin));
      await markSetupComplete();

      // Any outstanding code is now spent, and every existing session must go:
      // the PIN just changed, so previously issued tokens should not survive.
      await clearResetCode();
      await db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();

      log.info('PIN was reset', { via: authorisedBySession ? 'session' : 'reset-code' });

      return { success: true, message: 'PIN has been reset. Please log in with your new PIN.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/auth/status', async (request, reply) => {
    try {
      const clientToken = (request.headers['x-session-token'] as string) || '';

      const configRow = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'app_config'))
        .get();
      let isSetupComplete = false;
      if (configRow) {
        try {
          isSetupComplete = JSON.parse(configRow.value).isSetupComplete ?? false;
        } catch {
          log.warn('app_config is not valid JSON; treating setup as incomplete');
          isSetupComplete = false;
        }
      }

      return {
        isSetupComplete,
        isAuthenticated: await hasValidSession(clientToken),
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/auth/logout', limit(20), async (request, reply) => {
    try {
      await db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
