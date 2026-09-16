import crypto from 'crypto';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq, like } from 'drizzle-orm';

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY || '';
  // Hash the key to exactly 32 bytes using SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export async function decrypt(encryptedString: string): Promise<string> {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export async function storeCredential(
  connectorId: string,
  credentialKey: string,
  value: string
): Promise<void> {
  const encrypted = await encrypt(value);
  const key = `cred:${connectorId}:${credentialKey}`;
  await db.insert(appSettings)
    .values({
      key,
      value: encrypted,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: encrypted, updatedAt: new Date().toISOString() },
    });
}

export async function getCredential(
  connectorId: string,
  credentialKey: string
): Promise<string | null> {
  const key = `cred:${connectorId}:${credentialKey}`;
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (!row) return null;
  return decrypt(row.value);
}

export async function deleteCredential(connectorId: string): Promise<void> {
  const prefix = `cred:${connectorId}:`;
  const rows = await db.select().from(appSettings).where(like(appSettings.key, `${prefix}%`)).all();
  for (const row of rows) {
    await db.delete(appSettings).where(eq(appSettings.key, row.key)).run();
  }
}

/**
 * Move every credential from one connector id to another, returning how many
 * moved. Values are copied as-is (they stay encrypted at rest) and the source
 * rows are deleted, so this is a true move, not a copy.
 *
 * Used by the OAuth callback: pack flows handshake under a synthetic id that
 * was never a connector row. Without this the tokens (and later enrichment
 * values) sit under a dead id while the real connector row holds nothing —
 * a connection that looks live but can never publish.
 */
export async function moveCredentials(fromConnectorId: string, toConnectorId: string): Promise<number> {
  if (!fromConnectorId || !toConnectorId || fromConnectorId === toConnectorId) return 0;
  const prefix = `cred:${fromConnectorId}:`;
  const rows = await db.select().from(appSettings).where(like(appSettings.key, `${prefix}%`)).all();
  let moved = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const name = row.key.slice(prefix.length);
    if (!name) continue;
    const newKey = `cred:${toConnectorId}:${name}`;
    await db
      .insert(appSettings)
      .values({ key: newKey, value: row.value, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: row.value, updatedAt: now } });
    await db.delete(appSettings).where(eq(appSettings.key, row.key)).run();
    moved++;
  }
  return moved;
}
