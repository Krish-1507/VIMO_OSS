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
