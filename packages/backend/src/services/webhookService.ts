/**
 * Webhook Service
 *
 * Lets the user point VIMO at their own endpoint and get POSTed a JSON
 * payload whenever notable events happen (post published, post failed,
 * test fires, ...).
 *
 * Configuration is stored in app_settings (key: webhook_target_url).
 * Every delivery attempt is recorded in webhook_events so the UI can show
 * a delivery history. Delivery is best-effort: never blocks publishing and
 * never crashes the pipeline.
 */
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../db';
import { appSettings, webhookEvents, webhookRetries } from '../db/schema';
import { eq, desc, lte, sql } from 'drizzle-orm';

const WEBHOOK_URL_KEY = 'webhook_target_url';
const WEBHOOK_SECRET_KEY = 'webhook_secret';

// Exponential backoff (seconds) between retry attempts, after the initial
// failed delivery: ~5s, ~1min, ~10min. 3 retries max (4 attempts total).
const RETRY_BACKOFFS_SECONDS = [5, 60, 600];
export const MAX_WEBHOOK_RETRIES = RETRY_BACKOFFS_SECONDS.length;

let retryTimer: NodeJS.Timeout | null = null;

/**
 * Start the background retry drain. Safe to call multiple times; the server
 * calls this once at boot. The timer is unref'd so it never keeps the
 * process alive on its own.
 */
export function initWebhookRetryQueue(intervalMs = 15000): void {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    processPendingWebhookRetries().catch((err) => {
      console.warn('[Webhook] Retry drain failed:', (err as Error).message);
    });
  }, intervalMs);
  retryTimer.unref?.();
}

export interface WebhookConfig {
  url: string;
  secret: string;
}

export async function getWebhookConfig(): Promise<WebhookConfig> {
  const urlRow = db.select().from(appSettings).where(eq(appSettings.key, WEBHOOK_URL_KEY)).get();
  const secretRow = db.select().from(appSettings).where(eq(appSettings.key, WEBHOOK_SECRET_KEY)).get();
  return {
    url: urlRow?.value || '',
    secret: secretRow?.value || '',
  };
}

export async function setWebhookConfig(url: string, secret?: string): Promise<void> {
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key: WEBHOOK_URL_KEY, value: url.trim(), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: url.trim(), updatedAt: now } })
    .run();
  if (secret !== undefined) {
    db.insert(appSettings)
      .values({ key: WEBHOOK_SECRET_KEY, value: secret.trim(), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: secret.trim(), updatedAt: now } })
      .run();
  }
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function recordEvent(
  event: string,
  payload: Record<string, unknown>,
  url: string | null,
  responseStatus: number | null,
  responseBody: string | null
): string | null {
  try {
    const id = crypto.randomUUID();
    db.insert(webhookEvents)
      .values({
        id,
        event,
        url,
        payloadJson: JSON.stringify(payload),
        responseStatus,
        responseBody: responseBody ? responseBody.slice(0, 2000) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
    return id;
  } catch (err) {
    console.warn('[Webhook] Failed to record event:', (err as Error).message);
    return null;
  }
}

function enqueueWebhookRetry(
  eventId: string,
  url: string,
  body: string,
  signature: string | null
): void {
  try {
    const now = new Date();
    db.insert(webhookRetries)
      .values({
        id: crypto.randomUUID(),
        eventId,
        url,
        bodyJson: body,
        signature,
        attempts: 0,
        nextRetryAt: new Date(now.getTime() + RETRY_BACKOFFS_SECONDS[0] * 1000).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();
  } catch (err) {
    console.warn('[Webhook] Failed to enqueue retry:', (err as Error).message);
  }
}

/**
 * Deliver a single retry payload. Shared by the initial fire and the queue
 * drain so the two never drift.
 */
async function deliver(body: string, signature: string | null, url: string): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) {
    headers['X-VIMO-Signature'] = signature;
  }
  const res = await axios.post(url, body, { headers, timeout: 10000 });
  return res.status;
}

/**
 * Drain every due webhook retry. Runs from the background timer and can be
 * invoked directly in tests. Returns delivery stats for observability.
 */
export async function processPendingWebhookRetries(): Promise<{
  attempted: number;
  delivered: number;
  failed: number;
  givenUp: number;
}> {
  const stats = { attempted: 0, delivered: 0, failed: 0, givenUp: 0 };
  const now = new Date().toISOString();

  let due: Array<Record<string, any>> = [];
  try {
    due = db
      .select()
      .from(webhookRetries)
      .where(lte(webhookRetries.nextRetryAt, now))
      .orderBy(webhookRetries.nextRetryAt)
      .limit(20)
      .all() as Array<Record<string, any>>;
  } catch (err) {
    console.warn('[Webhook] Failed to load pending retries:', (err as Error).message);
    return stats;
  }

  for (const row of due) {
    stats.attempted += 1;
    try {
      const status = await deliver(row.bodyJson, row.signature, row.url);
      db.delete(webhookRetries).where(eq(webhookRetries.id, row.id)).run();
      db.update(webhookEvents)
        .set({ responseStatus: status, responseBody: 'Delivered on retry' })
        .where(eq(webhookEvents.id, row.eventId))
        .run();
      stats.delivered += 1;
    } catch (err: any) {
      const status = err?.response?.status || 0;
      const attempts = Number(row.attempts || 0) + 1;
      if (attempts >= MAX_WEBHOOK_RETRIES) {
        db.delete(webhookRetries).where(eq(webhookRetries.id, row.id)).run();
        db.update(webhookEvents)
          .set({ responseStatus: status, responseBody: 'Gave up after repeated failures' })
          .where(eq(webhookEvents.id, row.eventId))
          .run();
        stats.givenUp += 1;
      } else {
        const backoff = RETRY_BACKOFFS_SECONDS[Math.min(attempts, RETRY_BACKOFFS_SECONDS.length - 1)] ?? 600;
        const next = new Date(Date.now() + backoff * 1000).toISOString();
        db.update(webhookRetries)
          .set({ attempts, nextRetryAt: next, updatedAt: new Date().toISOString() })
          .where(eq(webhookRetries.id, row.id))
          .run();
        db.update(webhookEvents)
          .set({ responseStatus: status, responseBody: `Retry ${attempts} of ${MAX_WEBHOOK_RETRIES} scheduled` })
          .where(eq(webhookEvents.id, row.eventId))
          .run();
        stats.failed += 1;
      }
    }
  }

  return stats;
}

/**
 * Number of deliveries currently queued for retry (for the settings UI).
 */
export function getPendingRetryCount(): number {
  try {
    const row = db
      .select({ count: sql`COUNT(*)` })
      .from(webhookRetries)
      .all()[0] as any;
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

/**
 * Fire an outbound webhook for an event. Returns the delivery outcome.
 * No-op (and a success) when no webhook URL is configured.
 */
export async function fireWebhook(
  event: string,
  payload: Record<string, unknown>
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  try {
    let config: WebhookConfig = { url: '', secret: '' };
    try {
      config = await getWebhookConfig();
    } catch {
      config = { url: '', secret: '' };
    }
    if (!config.url) return { delivered: false, error: 'No webhook URL configured' };

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), payload });
    const signature = config.secret ? signPayload(body, config.secret) : null;

    try {
      const status = await deliver(body, signature, config.url);
      recordEvent(event, payload, config.url, status, JSON.stringify({}));
      return { delivered: true, status };
    } catch (err: any) {
      const status = err?.response?.status || 0;
      const eventId = recordEvent(event, payload, config.url, status, err?.message || 'Network error');
      // Best-effort retry queue: schedule up to 3 backoff retries so a
      // temporary outage on the receiving side does not lose the event.
      // The background timer (initWebhookRetryQueue) drains the queue.
      if (eventId) {
        enqueueWebhookRetry(eventId, config.url, body, signature);
      }
      return { delivered: false, status, error: err?.message || 'Network error' };
    }
  } catch (err: any) {
    return { delivered: false, error: err?.message || 'Webhook delivery failed' };
  }
}

/**
 * Record an inbound webhook (someone calling VIMO's listening endpoint).
 */
export async function recordInboundWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  recordEvent(event, payload, null, null, null);
}

/**
 * Recent delivery history for the webhook settings card.
 */
export function getWebhookEvents(limit = 20): Array<Record<string, unknown>> {
  try {
    return db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limit)
      .all()
      .map((row) => ({
        id: row.id,
        event: row.event,
        url: row.url,
        payload: row.payloadJson ? JSON.parse(row.payloadJson) : null,
        responseStatus: row.responseStatus,
        responseBody: row.responseBody,
        createdAt: row.createdAt,
      }));
  } catch (err) {
    console.warn('[Webhook] Failed to load events:', (err as Error).message);
    return [];
  }
}
