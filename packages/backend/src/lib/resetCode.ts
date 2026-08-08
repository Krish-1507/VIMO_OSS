/**
 * PIN reset codes.
 *
 * `POST /api/auth/reset-pin` used to accept any request with no authentication
 * at all — the only gate was typing "RESET" in the browser, which is trivially
 * bypassed with curl. Requiring a session alone would be wrong in the other
 * direction: a user who forgets their PIN would have no way back in.
 *
 * So reset accepts a valid session OR a one-time code that is printed to the
 * terminal running the server and written to a file next to the database. Both
 * channels require access to the machine VIMO runs on, which is exactly the
 * trust boundary a self-hosted single-user app has.
 *
 * The code is stored bcrypt-hashed, is single-use, and expires quickly.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from './logger';

const log = createLogger('auth:reset');

/** app_settings key holding the pending reset code. */
export const RESET_CODE_KEY = 'pin_reset_code';

/** Filename written next to the SQLite database. */
export const RESET_CODE_FILENAME = 'pin-reset-code.txt';

/** How long a code stays valid. */
export const RESET_CODE_TTL_MS = 10 * 60 * 1000;

/** Work factor for the code hash. Lower than the PIN cost: the code is high-entropy and short-lived. */
const CODE_BCRYPT_COST = 10;

interface StoredResetCode {
  hash: string;
  expiry: number;
}

/** Generate a uniformly distributed 8-digit code. */
export function generateResetCode(): string {
  // Rejection sampling keeps every code equally likely. A plain modulo of a
  // 32-bit value would bias the low end of the range.
  const range = 100_000_000; // 10^8
  const limit = Math.floor(0xffffffff / range) * range;
  let value: number;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= limit);
  return String(value % range).padStart(8, '0');
}

/** Directory holding the SQLite database, or null for in-memory databases. */
function dataDir(): string | null {
  const dbPath = process.env.DB_PATH || './data/vimo.db';
  if (dbPath === ':memory:' || dbPath.startsWith('file::memory:')) return null;
  return path.dirname(path.resolve(dbPath));
}

/** Absolute path of the reset-code file, or null when there is nowhere to write it. */
export function resetCodeFilePath(): string | null {
  const dir = dataDir();
  return dir ? path.join(dir, RESET_CODE_FILENAME) : null;
}

function printBanner(code: string, filePath: string | null): void {
  const line = '='.repeat(60);
  const parts = [
    '',
    line,
    '  VIMO — PIN RESET CODE',
    line,
    '',
    `      ${code}`,
    '',
    `  Valid for ${RESET_CODE_TTL_MS / 60000} minutes. It can be used once.`,
    '  Enter it on the "Reset your PIN" screen.',
  ];
  if (filePath) parts.push('', `  Also saved to: ${filePath}`);
  parts.push('', line, '');
  process.stdout.write(parts.join('\n') + '\n');
}

export interface IssuedResetCode {
  /** Where the code was written, or null when it was only printed. */
  filePath: string | null;
  expiresAt: number;
}

/**
 * Issue a fresh reset code, replacing any outstanding one.
 *
 * The code is never returned to the caller — it is delivered out-of-band via
 * the server console and the filesystem. Returning it in the HTTP response
 * would defeat the entire mechanism.
 */
export async function issueResetCode(): Promise<IssuedResetCode> {
  const code = generateResetCode();
  const expiry = Date.now() + RESET_CODE_TTL_MS;
  const hash = await bcrypt.hash(code, CODE_BCRYPT_COST);
  const payload: StoredResetCode = { hash, expiry };
  const value = JSON.stringify(payload);
  const now = new Date().toISOString();

  await db
    .insert(appSettings)
    .values({ key: RESET_CODE_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });

  const filePath = resetCodeFilePath();
  let written: string | null = null;
  if (filePath) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        [
          `VIMO PIN reset code: ${code}`,
          `Issued:  ${new Date().toISOString()}`,
          `Expires: ${new Date(expiry).toISOString()}`,
          '',
          'This code can be used once. Delete this file once you are back in.',
          '',
        ].join('\n'),
        // Owner read/write only. Best-effort: ignored on Windows.
        { mode: 0o600 },
      );
      written = filePath;
    } catch (err) {
      log.warn('Could not write the PIN reset code file; use the code printed above', {
        filePath,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  printBanner(code, written);
  return { filePath: written, expiresAt: expiry };
}

/** Remove any outstanding code. Called after a successful reset and on expiry. */
export async function clearResetCode(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, RESET_CODE_KEY)).run();

  const filePath = resetCodeFilePath();
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    log.warn('Could not delete the PIN reset code file', {
      filePath,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Check a submitted code. Consumes it on success so it cannot be replayed.
 *
 * Returns false for: no outstanding code, an expired code, a corrupt record,
 * or a mismatch. An expired code is cleared as a side effect.
 */
export async function consumeResetCode(submitted: string): Promise<boolean> {
  if (!submitted) return false;

  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, RESET_CODE_KEY))
    .get();
  if (!row) return false;

  let parsed: StoredResetCode;
  try {
    parsed = JSON.parse(row.value) as StoredResetCode;
  } catch {
    log.warn('Stored PIN reset code is unreadable; discarding it');
    await clearResetCode();
    return false;
  }

  if (!parsed?.hash || !Number.isFinite(parsed.expiry)) {
    log.warn('Stored PIN reset code is malformed; discarding it');
    await clearResetCode();
    return false;
  }

  if (Date.now() > parsed.expiry) {
    log.info('A PIN reset code was submitted after it expired');
    await clearResetCode();
    return false;
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(submitted, parsed.hash);
  } catch {
    return false;
  }

  // Single use: burn the code the moment it succeeds.
  if (ok) await clearResetCode();
  return ok;
}
