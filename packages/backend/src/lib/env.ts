/**
 * Startup environment validation.
 *
 * The single most dangerous failure mode in VIMO is booting with a weak or
 * placeholder `ENCRYPTION_KEY`. `credentialStore.getKey()` derives the AES key
 * with `sha256(ENCRYPTION_KEY)`, so a placeholder key is a *publicly known*
 * key: every OAuth token and API key VIMO has stored becomes decryptable by
 * anyone holding the repo.
 *
 * Policy (see plan decision D-2):
 *
 *   production  → a weak key is fatal. Refuse to boot, always.
 *   dev / test  → auto-heal, but only when there is nothing to lose. If the
 *                 database already holds encrypted credentials, rotating the
 *                 key would silently orphan them, so we refuse instead and
 *                 tell the operator exactly what to do.
 */

import crypto from 'crypto';
import fs from 'fs';
import { createLogger } from './logger';

const log = createLogger('env');

/**
 * Every placeholder that has ever shipped in `.env.example`.
 *
 * This list must be exhaustive. The original auto-heal logic only knew about
 * `change-this-to-a-random-32-character-string` while `.env.example` actually
 * shipped `your-32-char-random-encryption-key-here`, so the substitution never
 * fired and every fresh clone ran on the same known key. Adding a new
 * placeholder to `.env.example` without adding it here reintroduces that bug.
 */
export const ENCRYPTION_KEY_PLACEHOLDERS: readonly string[] = [
  'change-this-to-a-random-32-character-string',
  'your-32-char-random-encryption-key-here',
  'your-encryption-key-here',
  'changeme',
];

/** Minimum accepted key length, in characters. */
export const MIN_ENCRYPTION_KEY_LENGTH = 32;

export type KeyWeakness = 'missing' | 'placeholder' | 'too-short' | null;

/** Classify a key. Returns `null` when the key is acceptable. */
export function classifyEncryptionKey(raw: string | undefined): KeyWeakness {
  const key = (raw ?? '').trim();
  if (key.length === 0) return 'missing';
  if (ENCRYPTION_KEY_PLACEHOLDERS.includes(key.toLowerCase())) return 'placeholder';
  if (key.length < MIN_ENCRYPTION_KEY_LENGTH) return 'too-short';
  return null;
}

/** Generate a fresh 256-bit key as 64 hex characters. */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function describe(weakness: Exclude<KeyWeakness, null>): string {
  switch (weakness) {
    case 'missing':
      return 'ENCRYPTION_KEY is not set';
    case 'placeholder':
      return 'ENCRYPTION_KEY is still the example placeholder';
    case 'too-short':
      return `ENCRYPTION_KEY is shorter than ${MIN_ENCRYPTION_KEY_LENGTH} characters`;
  }
}

const REMEDY = [
  'Generate a strong key and put it in your .env file:',
  '',
  '    openssl rand -hex 32',
  '',
  'Then set:  ENCRYPTION_KEY=<the value you just generated>',
].join('\n');

function fatal(lines: string[]): never {
  const banner = '='.repeat(72);
  process.stderr.write(
    `\n${banner}\nVIMO REFUSED TO START\n${banner}\n\n${lines.join('\n')}\n\n${banner}\n\n`,
  );
  process.exit(1);
}

/**
 * Write `ENCRYPTION_KEY=<key>` into an env file, replacing any existing
 * assignment. Creates the file when absent.
 */
export function persistEncryptionKey(envPath: string, key: string): void {
  const line = `ENCRYPTION_KEY=${key}`;
  let content = '';

  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  if (/^ENCRYPTION_KEY=.*$/m.test(content)) {
    content = content.replace(/^ENCRYPTION_KEY=.*$/m, line);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += `${line}\n`;
  }

  fs.writeFileSync(envPath, content);
}

export interface ValidateOptions {
  /** Absolute path to the `.env` file to heal in development. */
  envPath: string;
  /**
   * Returns how many encrypted credentials already exist. Auto-healing is only
   * safe when this is 0 — rotating the key otherwise orphans real secrets.
   * Injected so this module stays independent of the db layer (and testable).
   */
  countStoredCredentials: () => number;
  /** Defaults to `process.env.NODE_ENV`. */
  nodeEnv?: string;
}

/**
 * Validate `ENCRYPTION_KEY`, healing it in development where safe.
 *
 * Call this after dotenv has populated `process.env` and before anything
 * encrypts or decrypts. On the healing path `process.env.ENCRYPTION_KEY` is
 * updated in place, so the running process uses the new key immediately.
 *
 * @returns `true` if a new key was generated, `false` if the existing key was
 *          already acceptable. Never returns when the key is unusable.
 */
export function validateEncryptionKey(options: ValidateOptions): boolean {
  const { envPath, countStoredCredentials } = options;
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const weakness = classifyEncryptionKey(process.env.ENCRYPTION_KEY);

  if (weakness === null) return false;

  // ── Production: never guess, never heal. ────────────────────────────────
  if (nodeEnv === 'production') {
    fatal([
      `${describe(weakness)}, and NODE_ENV=production.`,
      '',
      'Running in production with a weak key means every credential VIMO has',
      'stored can be decrypted by anyone who has the source code.',
      '',
      REMEDY,
    ]);
  }

  // ── Dev/test: heal only when there is nothing to lose. ──────────────────
  let existingCredentials = 0;
  try {
    existingCredentials = countStoredCredentials();
  } catch (err) {
    // If we cannot inspect the database we must assume credentials exist;
    // guessing wrong in the other direction destroys them.
    fatal([
      `${describe(weakness)}, and VIMO could not check whether stored`,
      'credentials would be affected by generating a new one.',
      '',
      `Reason: ${err instanceof Error ? err.message : String(err)}`,
      '',
      REMEDY,
    ]);
  }

  if (existingCredentials > 0) {
    fatal([
      `${describe(weakness)}, but this installation already has`,
      `${existingCredentials} encrypted credential(s) stored.`,
      '',
      'Generating a new key now would make all of them permanently unreadable,',
      'so VIMO will not do it automatically.',
      '',
      'Either restore the ENCRYPTION_KEY these credentials were saved with, or',
      'disconnect the affected connectors and let VIMO generate a fresh key.',
      '',
      REMEDY,
    ]);
  }

  const key = generateEncryptionKey();
  process.env.ENCRYPTION_KEY = key;

  try {
    persistEncryptionKey(envPath, key);
    log.warn(`${describe(weakness)} — generated a new one and saved it to .env`, {
      envPath,
      nodeEnv,
    });
  } catch (err) {
    // The in-memory key still works for this run; the user just loses it on
    // restart. Warn loudly rather than crashing a dev server over it.
    log.warn(`${describe(weakness)} — generated a new one, but could not write it to .env`, {
      envPath,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return true;
}
