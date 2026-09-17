/**
 * Browser session routes — stay-logged-in profiles + approval-gated control.
 *
 * Login flow (user, once per account):
 *   POST /api/browser-sessions/x-main/launch { "headless": false }
 *   → a visible Chromium opens → user logs into X/IG/TikTok manually
 *   POST /api/browser-sessions/x-main/close
 *   → profile stays on disk. The agent reuses it headlessly from here on.
 *
 * Agent flow:
 *   POST /api/browser-sessions/x-main/read { "url": "https://x.com/..." }
 *   POST /api/browser-sessions/x-main/act { click/type/keypress, ... }
 *     → without approval: creates an approval request, returns 202 + id
 *     → with approved id: executes, returns the fresh snapshot
 */
import { FastifyInstance } from 'fastify';
import {
  listSessions,
  launchSession,
  closeSession,
  deleteSession,
  readPage,
  takeScreenshot,
  loginStatus,
  writeAction,
  type BrowserWriteAction,
} from '../services/browserSessionService';
import { formatError } from '../lib/errorFormatter';

export default async function browserSessionRoutes(app: FastifyInstance) {
  app.get('/api/browser-sessions', async () => {
    return { sessions: listSessions() };
  });

  app.post('/api/browser-sessions/:key/launch', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const body = (request.body as { headless?: boolean; label?: string }) || {};
      const result = await launchSession(key, { headless: body.headless, label: body.label });
      return { success: true, ...result };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/browser-sessions/:key/close', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      return { success: true, ...(await closeSession(key)) };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.delete('/api/browser-sessions/:key', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      return { success: true, ...(await deleteSession(key)) };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/browser-sessions/:key/read', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const body = request.body as { url?: string };
      if (!body.url) return reply.status(400).send({ error: 'url is required' });
      return { success: true, snapshot: await readPage(key, body.url) };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/browser-sessions/:key/screenshot', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      return { success: true, ...(await takeScreenshot(key)) };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/browser-sessions/:key/login-status', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const body = (request.body as { domains?: string[] }) || {};
      return { success: true, ...(await loginStatus(key, body.domains || [])) };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/browser-sessions/:key/act', async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const body = request.body as BrowserWriteAction & {
        approvalRequestId?: string;
        brandProfileId?: string;
      };
      if (!body.kind || !body.selector) {
        return reply.status(400).send({ error: 'kind and selector are required' });
      }
      const result = await writeAction(
        key,
        { kind: body.kind, selector: body.selector, text: body.text, key: body.key, url: body.url },
        { approvalRequestId: body.approvalRequestId, brandProfileId: body.brandProfileId },
      );
      if (result.decision === 'pending') return reply.status(202).send({ success: false, ...result });
      if (result.decision === 'rejected') return reply.status(403).send({ success: false, ...result });
      return { success: true, ...result };
    } catch (err) {
      return reply.status(400).send(formatError(err));
    }
  });
}
