import { describe, it, expect } from 'vitest';
import * as credentialStore from '../lib/credentialStore';

describe('credentialStore', () => {
  it('encrypt then decrypt returns original plaintext', async () => {
    const original = 'test-api-key-123';
    const encrypted = await credentialStore.encrypt(original);
    const decrypted = await credentialStore.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('decrypt with correct key works', async () => {
    const original = 'secret';
    const encrypted = await credentialStore.encrypt(original);
    const decrypted = await credentialStore.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('no plaintext value ever appears in the encrypted string', async () => {
    const original = 'secret-value';
    const encrypted = await credentialStore.encrypt(original);
    expect(encrypted).not.toContain(original);
  });
});
