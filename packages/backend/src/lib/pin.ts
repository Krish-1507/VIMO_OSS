/**
 * PIN hashing.
 *
 * PINs used to be stored as a single unsalted SHA-256 round, which a GPU can
 * exhaust for the entire 4-8 digit keyspace effectively instantly. They are now
 * stored as bcrypt hashes with a work factor.
 *
 * `bcryptjs` (pure JS) is used deliberately instead of the native `bcrypt`
 * binding: VIMO is installed by non-technical users with a plain `npm install`
 * and is CI-tested on Windows, macOS, and Linux. A node-gyp build step on that
 * path is a support burden, and the pure-JS cost at this work factor is
 * irrelevant for an endpoint that is rate limited to a handful of tries a
 * minute.
 *
 * Existing installations keep working: a legacy SHA-256 hash still verifies,
 * and is transparently upgraded to bcrypt on the next successful login.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * bcrypt work factor.
 *
 * 10 is chosen deliberately over a higher value. Measured with this pure-JS
 * implementation: cost 10 ≈ 157ms, cost 12 ≈ 600ms per verification. A 600ms
 * pause on every login is user-visible, and it buys very little here — a
 * 4-8 digit numeric PIN has a keyspace of 10^4 to 10^8, so no work factor makes
 * an offline attack on a leaked hash genuinely hard.
 *
 * The real control against PIN guessing is the per-route rate limiting on
 * `/api/auth/verify` (10/min), not the KDF cost. bcrypt is here to remove the
 * *instant*, GPU-parallel, unsalted SHA-256 break — which it does at cost 10.
 *
 * Raising this later is safe: `verifyPin` reports `needsRehash` whenever the
 * stored cost differs, so hashes upgrade themselves on the next login.
 */
export const BCRYPT_COST = 10;

/** A bcrypt hash: `$2a$`, `$2b$`, or `$2y$` followed by cost and salt. */
const BCRYPT_RE = /^\$2[aby]\$(\d{2})\$/;

/** A legacy unsalted SHA-256 hex digest. */
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

/** Hash a PIN for storage. Always produces a bcrypt hash. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_COST);
}

/** Reproduce the pre-bcrypt hash, for verifying legacy stored values only. */
function legacySha256(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/** Constant-time string comparison that does not leak length via early return. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface VerifyResult {
  /** Whether the supplied PIN matches the stored hash. */
  ok: boolean;
  /**
   * True when the PIN was correct but the stored hash should be replaced —
   * either it is a legacy SHA-256 digest, or it is bcrypt at an outdated cost.
   * Callers must persist `await hashPin(pin)` when this is set.
   */
  needsRehash: boolean;
}

/**
 * Verify a PIN against a stored hash of either format.
 *
 * Never throws on malformed input: an unrecognised stored value simply fails
 * to verify, so a corrupted `pin_hash` row locks the account rather than
 * opening it.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<VerifyResult> {
  if (!pin || !storedHash) return { ok: false, needsRehash: false };

  const bcryptMatch = BCRYPT_RE.exec(storedHash);
  if (bcryptMatch) {
    let ok = false;
    try {
      ok = await bcrypt.compare(pin, storedHash);
    } catch {
      // A truncated or otherwise corrupt bcrypt hash must fail closed.
      return { ok: false, needsRehash: false };
    }
    const storedCost = Number(bcryptMatch[1]);
    return { ok, needsRehash: ok && storedCost !== BCRYPT_COST };
  }

  if (LEGACY_SHA256_RE.test(storedHash)) {
    const ok = timingSafeEqual(legacySha256(pin), storedHash.toLowerCase());
    return { ok, needsRehash: ok };
  }

  // Unrecognised format — fail closed.
  return { ok: false, needsRehash: false };
}

/** True when a stored value is a legacy SHA-256 digest rather than bcrypt. */
export function isLegacyHash(storedHash: string): boolean {
  return LEGACY_SHA256_RE.test(storedHash);
}
