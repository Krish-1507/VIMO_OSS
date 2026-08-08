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
import { appSettings, webhookEvents } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

const WEBHOOK_URL_KEY = 'webhook_target_url';
const WEBHOOK_SECRET_KEY = 'webhook_secret';

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
): void {
  try {
    db.insert(webhookEvents)
      .values({
        id: crypto.randomUUID(),
        event,
        url,
        payloadJson: JSON.stringify(payload),
        responseStatus,
        responseBody: responseBody ? responseBody.slice(0, 2000) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    console.warn('[Webhook] Failed to record event:', (err as Error).message);
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.secret) {
      headers['X-VIMO-Signature'] = signPayload(body, config.secret);
    }

    const res = await axios.post(config.url, body, { headers, timeout: 10000 });
    recordEvent(event, payload, config.url, res.status, JSON.stringify(res.data || {}));
    return { delivered: true, status: res.status };
  } catch (err: any) {
    const status = err?.response?.status || 0;
    recordEvent(event, payload, null, status, err?.message || 'Network error');
    return { delivered: false, status, error: err?.message || 'Network error' };
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
