/**
 * Email Notifications Service
 *
 * Best-effort email delivery over SMTP using only Node's built-in net/tls
 * modules (no external mail dependency). Config lives in app_settings:
 *   - email_notifications_enabled ("1"/"0")
 *   - email_recipient        (who gets emails; falls back to the user profile email)
 *   - smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
 *
 * If SMTP is not configured, sending is a quiet no-op: nothing crashes and
 * in-app notifications still work exactly as before.
 */
import net from 'net';
import tls from 'tls';
import { db } from '../db';
import { appSettings, userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface EmailConfig {
  enabled: boolean;
  recipient: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
}

const CONFIG_KEYS = {
  enabled: 'email_notifications_enabled',
  recipient: 'email_recipient',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpUser: 'smtp_user',
  smtpPass: 'smtp_pass',
  smtpFrom: 'smtp_from',
} as const;

function getSetting(key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, updatedAt: new Date().toISOString() }).run();
  }
}

function defaultRecipient(): string {
  const profile = db.select().from(userProfiles).limit(1).get();
  return profile?.email || '';
}

export function getEmailConfig(): EmailConfig {
  return {
    enabled: getSetting(CONFIG_KEYS.enabled) === '1',
    recipient: getSetting(CONFIG_KEYS.recipient) || defaultRecipient(),
    smtpHost: getSetting(CONFIG_KEYS.smtpHost) || '',
    smtpPort: Number(getSetting(CONFIG_KEYS.smtpPort) || 587),
    smtpUser: getSetting(CONFIG_KEYS.smtpUser) || '',
    smtpPass: getSetting(CONFIG_KEYS.smtpPass) || '',
    smtpFrom: getSetting(CONFIG_KEYS.smtpFrom) || 'VIMO <no-reply@vimo.app>',
  };
}

export function setEmailConfig(partial: Partial<Omit<EmailConfig, 'enabled'>> & { enabled?: boolean }): void {
  if (partial.enabled !== undefined) setSetting(CONFIG_KEYS.enabled, partial.enabled ? '1' : '0');
  if (partial.recipient !== undefined) setSetting(CONFIG_KEYS.recipient, partial.recipient.trim());
  if (partial.smtpHost !== undefined) setSetting(CONFIG_KEYS.smtpHost, partial.smtpHost.trim());
  if (partial.smtpPort !== undefined) setSetting(CONFIG_KEYS.smtpPort, String(partial.smtpPort));
  if (partial.smtpUser !== undefined) setSetting(CONFIG_KEYS.smtpUser, partial.smtpUser.trim());
  if (partial.smtpPass !== undefined) setSetting(CONFIG_KEYS.smtpPass, partial.smtpPass.trim());
  if (partial.smtpFrom !== undefined) setSetting(CONFIG_KEYS.smtpFrom, partial.smtpFrom.trim());
}

/* ------------------------------------------------------------------ */
/*  Minimal SMTP client (Node built-ins only)                         */
/* ------------------------------------------------------------------ */

function buildMessage(from: string, to: string, subject: string, text: string, html?: string): string {
  const boundary = `vimo-${Date.now().toString(16)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject.replace(/[\r\n]+/g, ' ')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html || text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>'),
    '',
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

/**
 * Deliver one email over SMTP. Returns a human-readable outcome.
 * Supports implicit TLS (465) and STARTTLS (587/25).
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<{ ok: boolean; message: string }> {
  const config = getEmailConfig();
  if (!config.enabled) return { ok: false, message: 'Email notifications are disabled' };
  if (!config.recipient) return { ok: false, message: 'No recipient configured' };
  if (!config.smtpHost) return { ok: false, message: 'SMTP host not configured' };

  const port = config.smtpPort || 587;
  const useImplicitTls = port === 465;

  return new Promise((resolve) => {
    let socket: net.Socket = useImplicitTls
      ? tls.connect({ host: config.smtpHost, port, rejectUnauthorized: false })
      : net.connect({ host: config.smtpHost, port });

    type Phase =
      | 'greeting' | 'ehlo' | 'starttls' | 'auth' | 'mail' | 'rcpt' | 'data' | 'content' | 'quit' | 'done';
    let phase: Phase = 'greeting';
    let ehloCapabilities = '';

    const done = (ok: boolean, message: string) => {
      try { socket.destroy(); } catch (err) { console.warn('[Email] Failed to close SMTP socket:', (err as Error).message); }
      resolve({ ok, message });
    };

    const send = (line: string) => socket.write(line + '\r\n');

    socket.setTimeout(20000);
    socket.on('timeout', () => done(false, 'SMTP connection timed out'));
    socket.on('error', (err) => done(false, `SMTP connection error: ${err.message}`));

    const handle = (code: number, message: string) => {
      switch (phase) {
        case 'greeting':
          if (code === 220) {
            phase = 'ehlo';
            send(`EHLO ${osHostname()}`);
          } else {
            done(false, `SMTP greeting failed (${code}): ${message}`);
          }
          return;

        case 'ehlo':
          if (code === 250) {
            ehloCapabilities = message.toUpperCase();
            if (!useImplicitTls && ehloCapabilities.includes('STARTTLS') && !config.smtpPass) {
              // Plain connection without credentials — still try STARTTLS for privacy.
              phase = 'starttls';
              send('STARTTLS');
            } else if (!useImplicitTls && ehloCapabilities.includes('STARTTLS')) {
              phase = 'starttls';
              send('STARTTLS');
            } else if (config.smtpUser) {
              phase = 'auth';
              const auth = Buffer.from(`\u0000${config.smtpUser}\u0000${config.smtpPass || ''}`).toString('base64');
              send(`AUTH PLAIN ${auth}`);
            } else {
              phase = 'mail';
              send(`MAIL FROM:<${extractAddress(config.smtpFrom)}>`);
            }
          } else {
            done(false, `Server rejected EHLO (${code}): ${message}`);
          }
          return;

        case 'starttls':
          if (code === 220) {
            socket = tls.connect({ socket, rejectUnauthorized: false });
            socket.setTimeout(20000);
            socket.on('timeout', () => done(false, 'SMTP connection timed out'));
            socket.on('error', (err) => done(false, `SMTP connection error: ${err.message}`));
            socket.on('data', (chunk) => onData(chunk));
            phase = 'ehlo';
            send(`EHLO ${osHostname()}`);
          } else {
            done(false, `STARTTLS rejected (${code}): ${message}`);
          }
          return;

        case 'auth':
          if (code === 235 || code === 334) {
            phase = 'mail';
            send(`MAIL FROM:<${extractAddress(config.smtpFrom)}>`);
          } else if (code === 503) {
            phase = 'mail';
            send(`MAIL FROM:<${extractAddress(config.smtpFrom)}>`);
          } else {
            done(false, `SMTP authentication failed (${code}): ${message}`);
          }
          return;

        case 'mail':
          if (code === 250) {
            phase = 'rcpt';
            send(`RCPT TO:<${to}>`);
          } else {
            done(false, `MAIL FROM rejected (${code}): ${message}`);
          }
          return;

        case 'rcpt':
          if (code === 250 || code === 251) {
            phase = 'data';
            send('DATA');
          } else {
            done(false, `RCPT TO rejected (${code}): ${message}`);
          }
          return;

        case 'data':
          if (code === 354) {
            phase = 'content';
            socket.write(buildMessage(config.smtpFrom, to, subject, text, html) + '\r\n.\r\n');
          } else {
            done(false, `DATA rejected (${code}): ${message}`);
          }
          return;

        case 'content':
          if (code === 250) {
            phase = 'quit';
            send('QUIT');
          } else {
            done(false, `Message rejected (${code}): ${message}`);
          }
          return;

        case 'quit':
        case 'done':
          done(code === 221, code === 221 ? 'Email sent' : `Unexpected close (${code}): ${message}`);
          return;
      }
    };

    let buffer = '';
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const idx = buffer.indexOf('\r\n');
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!/^\d{3}[ -]/.test(line) || line.length < 4) continue;
        const code = Number(line.slice(0, 3));
        const isLast = line[3] === ' ';
        if (isLast) {
          handle(code, line.slice(4));
          if (phase === 'done') return;
        }
      }
    };
    socket.on('data', onData);
  });
}

function osHostname(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('os').hostname() || 'localhost';
  } catch {
    return 'localhost';
  }
}

function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/* ------------------------------------------------------------------ */
/*  Notification helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Best-effort email for a notification event. No-ops (with a debug log)
 * when email is not configured, so in-app notifications stay primary.
 */
export async function notifyByEmail(
  subject: string,
  text: string
): Promise<{ ok: boolean; message: string }> {
  const config = getEmailConfig();
  if (!config.enabled) return { ok: false, message: 'Email notifications disabled' };
  if (!config.recipient) return { ok: false, message: 'No email recipient set' };
  if (!config.smtpHost) {
    console.warn('[Email] Email enabled but no SMTP host configured — skipping send.');
    return { ok: false, message: 'SMTP host not configured' };
  }
  const result = await sendEmail(config.recipient, subject, text);
  if (!result.ok) {
    console.warn('[Email] Delivery failed:', result.message);
  }
  return result;
}
