import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { encryptSession, decryptSession } from '../lib/session';

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/setup', async (request, reply) => {
    try {
      const { pin } = request.body as { pin: string };
      if (!pin || !/^\d{4,8}$/.test(pin)) {
        return reply.status(400).send({ error: 'PIN must be 4-8 digits' });
      }

      const pinHash = hashPin(pin);
      await db.insert(appSettings).values({
        key: 'pin_hash',
        value: pinHash,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: pinHash, updatedAt: new Date().toISOString() },
      });

      await db.insert(appSettings).values({
        key: 'app_config',
        value: JSON.stringify({ isSetupComplete: true }),
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: JSON.stringify({ isSetupComplete: true }), updatedAt: new Date().toISOString() },
      });

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/auth/verify', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    try {
      const { pin } = request.body as { pin: string };
      const pinRow = await db.select().from(appSettings).where(eq(appSettings.key, 'pin_hash')).get();
      if (!pinRow) {
        return reply.status(401).send({ code: 'NO_PIN_SET', message: 'No PIN has been set yet. Please complete setup first.' });
      }
      if (hashPin(pin) !== pinRow.value) {
        return reply.status(401).send({ code: 'INVALID_PIN', message: 'Incorrect PIN. Please try again.' });
      }

      const token = generateSessionToken();
      const expiry = Date.now() + 24 * 60 * 60 * 1000;
      const encrypted = await encryptSession(token, expiry);
      await db.insert(appSettings).values({
        key: 'session_token',
        value: encrypted,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: encrypted, updatedAt: new Date().toISOString() },
      });

      return { success: true, token };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Renew session token (extend by 24h)
  app.post('/api/auth/renew', async (request, reply) => {
    try {
      const clientToken = (request.headers['x-session-token'] as string) || '';
      const sessionRow = await db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
      const session = await decryptSession(sessionRow);
      if (!session) {
        return reply.status(401).send(formatError(new Error('No session found')));
      }

      if (session.token !== clientToken) {
        return reply.status(401).send(formatError(new Error('Invalid session token')));
      }

      const newToken = generateSessionToken();
      const newExpiry = Date.now() + 24 * 60 * 60 * 1000;
      const encrypted = await encryptSession(newToken, newExpiry);
      await db.insert(appSettings).values({
        key: 'session_token',
        value: encrypted,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: encrypted, updatedAt: new Date().toISOString() },
      });

      return { success: true, token: newToken, expiresAt: newExpiry };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Reset PIN (requires system-check mode=reset — no old PIN needed for local single-user app)
  app.post('/api/auth/reset-pin', async (request, reply) => {
    try {
      const { pin } = request.body as { pin: string };
      if (!pin || !/^\d{4,8}$/.test(pin)) {
        return reply.status(400).send({ error: 'PIN must be 4-8 digits' });
      }

      const pinHash = hashPin(pin);
      await db.insert(appSettings).values({
        key: 'pin_hash',
        value: pinHash,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: pinHash, updatedAt: new Date().toISOString() },
      });

      // Keep isSetupComplete = true since we already have a setup
      const configRow = await db.select().from(appSettings).where(eq(appSettings.key, 'app_config')).get();
      if (configRow) {
        const config = JSON.parse(configRow.value);
        if (!config.isSetupComplete) {
          await db.update(appSettings).set({
            value: JSON.stringify({ isSetupComplete: true }),
            updatedAt: new Date().toISOString(),
          }).where(eq(appSettings.key, 'app_config')).run();
        }
      }

      // Clear existing session so user must re-login
      await db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();

      return { success: true, message: 'PIN has been reset. Please log in with your new PIN.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/auth/status', async (request, reply) => {
    try {
      const clientToken = (request.headers['x-session-token'] as string) || '';

      const configRow = await db.select().from(appSettings).where(eq(appSettings.key, 'app_config')).get();
      let isSetupComplete = false;
      if (configRow) {
        try {
          isSetupComplete = JSON.parse(configRow.value).isSetupComplete ?? false;
        } catch {
          isSetupComplete = false;
        }
      }

      const sessionRow = await db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
      let isAuthenticated = false;
      if (sessionRow && clientToken) {
        const session = await decryptSession(sessionRow);
        isAuthenticated = !!session && session.token === clientToken && Date.now() <= session.expiry;
      }

      return { isSetupComplete, isAuthenticated };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    try {
      await db.delete(appSettings).where(eq(appSettings.key, 'session_token')).run();
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
