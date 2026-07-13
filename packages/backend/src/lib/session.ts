import { encrypt, decrypt } from './credentialStore';

/**
 * Session tokens are now encrypted at rest with the same AES-256-GCM scheme
 * used for connector credentials. They are stored as `<token>|<expiry>` but
 * the whole string is encrypted before it touches the database.
 *
 * A legacy fallback is kept: if the stored value can't be decrypted it is
 * treated as plaintext. This only happens for tokens created before
 * encryption was enabled and are harmlessly replaced on the next login.
 */
export async function encryptSession(token: string, expiry: number): Promise<string> {
  return encrypt(`${token}|${expiry}`);
}

export interface DecryptedSession {
  token: string;
  expiry: number;
}

export async function decryptSession(
  row: { value: string } | undefined,
): Promise<DecryptedSession | null> {
  if (!row) return null;

  let raw: string;
  try {
    raw = await decrypt(row.value);
  } catch {
    // Legacy plaintext token from before at-rest encryption.
    raw = row.value;
  }

  const [token, expiryStr] = raw.split('|');
  if (!token) return null;
  return { token, expiry: Number(expiryStr) };
}
