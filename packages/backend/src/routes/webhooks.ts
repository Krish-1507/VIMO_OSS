/**
 * Webhook Routes
 *
 * GET    /api/webhooks/config        — current target URL + secret presence
 * POST   /api/webhooks/config        — save target URL (+ optional secret)
 * GET    /api/webhooks/events        — delivery history
 * POST   /api/webhooks/fire-test     — run a real publish test and deliver
 *                                      the result webhook
 * POST   /api/webhooks/receive/:token — inbound listening endpoint
 */

import { FastifyInstance } from 'fastify';
import { formatError } from '../lib/errorFormatter';
import {
  getWebhookConfig,
  setWebhookConfig,
  fireWebhook,
  recordInboundWebhook,
  getWebhookEvents,
} from '../services/webhookService';

export default async function webhookRoutes(app: FastifyInstance) {
  // GET /api/webhooks/config
  app.get('/api/webhooks/config', async () => {
    const config = await getWebhookConfig();
    return { url: config.url, hasSecret: Boolean(config.secret) };
  });

  // POST /api/webhooks/config
  app.post('/api/webhooks/config', async (request, reply) => {
    try {
      const body = request.body as { url?: string; secret?: string };
      const url = (body.url || '').trim();
      if (url && !/^https?:\/\/.+/i.test(url)) {
        return reply.status(400).send({ error: 'Webhook URL must start with http:// or https://' });
      }
      await setWebhookConfig(url, body.secret !== undefined ? (body.secret || '') : undefined);
      return { success: true, url };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/webhooks/events
  app.get('/api/webhooks/events', async () => {
    return { events: getWebhookEvents(20) };
  });

  // POST /api/webhooks/fire-test — publish test content through the real
  // pipeline, then deliver the result to the configured webhook URL.
  app.post('/api/webhooks/fire-test', async (request, reply) => {
    try {
      const body = request.body as {
        content: string;
        platforms: string[];
        mediaUrls?: string[];
        scheduledAt?: string;
        metadata?: Record<string, unknown>;
      };

      if (!body.content || !Array.isArray(body.platforms) || body.platforms.length === 0) {
        return reply.status(400).send({ error: 'content and platforms (non-empty array) are required' });
      }

      const { vimoSocialPublish } = await import('../services/vimoSocialPublishService');
      const result = await vimoSocialPublish.publish({
        postId: `test-${Date.now()}`,
        content: body.content,
        platforms: body.platforms,
        mediaUrls: body.mediaUrls,
        scheduledAt: body.scheduledAt,
        metadata: body.metadata || {},
      });

      const delivery = await fireWebhook('test', {
        type: 'test',
        published: result.success,
        results: result.platformResults,
        error: result.error,
      });

      return {
        success: result.success,
        results: result.platformResults,
        error: result.error,
        webhookDelivery: delivery,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/webhooks/receive/:token — inbound listening endpoint.
  // Any third-party service can POST here; VIMO records the event and
  // emits it over the socket for the UI.
  app.post('/api/webhooks/receive/:token', async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      const config = await getWebhookConfig();
      if (!config.url || config.url.includes('/api/webhooks/receive/')) {
        // Inbound receiving is open when no outbound target is set; when a
        // target is configured we still record the call (it came to VIMO).
      }
      void token;
      const payload = (request.body as Record<string, unknown>) || {};
      const event = String(payload.event || 'inbound');
      await recordInboundWebhook(event, payload);
      return { success: true, received: event };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
