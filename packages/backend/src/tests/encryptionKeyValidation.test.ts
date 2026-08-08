/**
 * ENCRYPTION_KEY startup validation.
 *
 * `credentialStore.getKey()` derives the AES key from sha256(ENCRYPTION_KEY),
 * so a placeholder key is a publicly known key. Before this guard existed the
 * auto-heal in index.ts searched for a placeholder string that `.env.example`
 * did not actually contain, so every fresh clone booted on the same key.
 *
 * The regression these tests exist to prevent: a placeholder that ships in
 * `.env.example` but is missing from ENCRYPTION_KEY_PLACEHOLDERS.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  classifyEncryptionKey,
  generateEncryptionKey,
  persistEncryptionKey,
  validateEncryptionKey,
  ENCRYPTION_KEY_PLACEHOLDERS,
  MIN_ENCRYPTION_KEY_LENGTH,
} from '../lib/env';

let tmpDir: string;
let envPath: string;
const originalKey = process.env.ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vimo-env-'));
  envPath = path.join(tmpDir, '.env');
});

afterEach(() => {
  process.env.ENCRYPTION_KEY = originalKey;
  process.env.NODE_ENV = originalNodeEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('classifyEncryptionKey', () => {
  it('flags an unset key as missing', () => {
    expect(classifyEncryptionKey(undefined)).toBe('missing');
    expect(classifyEncryptionKey('')).toBe('missing');
    expect(classifyEncryptionKey('   ')).toBe('missing');
  });

  it('flags every shipped placeholder', () => {
    for (const placeholder of ENCRYPTION_KEY_PLACEHOLDERS) {
      expect(classifyEncryptionKey(placeholder)).toBe('placeholder');
    }
  });

  it('flags a key shorter than the minimum', () => {
    expect(classifyEncryptionKey('abc')).toBe('too-short');
    expect(classifyEncryptionKey('a'.repeat(MIN_ENCRYPTION_KEY_LENGTH - 1))).toBe('too-short');
  });

  it('accepts a key at or above the minimum length', () => {
    expect(classifyEncryptionKey('a'.repeat(MIN_ENCRYPTION_KEY_LENGTH))).toBeNull();
    expect(classifyEncryptionKey(generateEncryptionKey())).toBeNull();
  });

  it('accepts every generated key', () => {
    for (let i = 0; i < 20; i++) {
      expect(classifyEncryptionKey(generateEncryptionKey())).toBeNull();
    }
  });

  /**
   * Guards the exact bug that shipped: a placeholder in `.env.example` that
   * the validator does not recognise. If someone edits `.env.example` without
   * updating ENCRYPTION_KEY_PLACEHOLDERS, this fails.
   */
  it('recognises the placeholder currently shipped in .env.example', () => {
    const examplePath = path.resolve(__dirname, '../../../../.env.example');
    const content = fs.readFileSync(examplePath, 'utf8');
    const match = content.match(/^ENCRYPTION_KEY=(.*)$/m);

    expect(match, 'ENCRYPTION_KEY missing from .env.example').toBeTruthy();
    expect(
      classifyEncryptionKey(match![1].trim()),
      'the ENCRYPTION_KEY value in .env.example is not recognised as weak — ' +
        'add it to ENCRYPTION_KEY_PLACEHOLDERS in lib/env.ts',
    ).not.toBeNull();
  });
});

describe('persistEncryptionKey', () => {
  it('creates the file when it does not exist', () => {
    persistEncryptionKey(envPath, 'abc123');
    expect(fs.readFileSync(envPath, 'utf8')).toContain('ENCRYPTION_KEY=abc123');
  });

  it('replaces an existing assignment without touching other keys', () => {
    fs.writeFileSync(envPath, 'PORT=3000\nENCRYPTION_KEY=old-value\nLOG_LEVEL=info\n');
    persistEncryptionKey(envPath, 'new-value');

    const content = fs.readFileSync(envPath, 'utf8');
    expect(content).toContain('ENCRYPTION_KEY=new-value');
    expect(content).not.toContain('old-value');
    expect(content).toContain('PORT=3000');
    expect(content).toContain('LOG_LEVEL=info');
  });

  it('appends when no assignment exists, preserving a missing trailing newline', () => {
    fs.writeFileSync(envPath, 'PORT=3000');
    persistEncryptionKey(envPath, 'appended');

    const content = fs.readFileSync(envPath, 'utf8');
    expect(content).toBe('PORT=3000\nENCRYPTION_KEY=appended\n');
  });
});

describe('validateEncryptionKey', () => {
  it('leaves a strong key untouched', () => {
    const strong = generateEncryptionKey();
    process.env.ENCRYPTION_KEY = strong;

    const generated = validateEncryptionKey({
      envPath,
      countStoredCredentials: () => 0,
      nodeEnv: 'development',
    });

    expect(generated).toBe(false);
    expect(process.env.ENCRYPTION_KEY).toBe(strong);
    expect(fs.existsSync(envPath)).toBe(false);
  });

  it('heals a placeholder key in development when no credentials exist', () => {
    process.env.ENCRYPTION_KEY = 'change-this-to-a-random-32-character-string';

    const generated = validateEncryptionKey({
      envPath,
      countStoredCredentials: () => 0,
      nodeEnv: 'development',
    });

    expect(generated).toBe(true);
    expect(classifyEncryptionKey(process.env.ENCRYPTION_KEY)).toBeNull();
    expect(process.env.ENCRYPTION_KEY).toMatch(/^[a-f0-9]{64}$/);
    // The generated key is persisted so it survives a restart.
    expect(fs.readFileSync(envPath, 'utf8')).toContain(
      `ENCRYPTION_KEY=${process.env.ENCRYPTION_KEY}`,
    );
  });

  it('heals a missing key in development', () => {
    delete process.env.ENCRYPTION_KEY;

    expect(
      validateEncryptionKey({
        envPath,
        countStoredCredentials: () => 0,
        nodeEnv: 'development',
      }),
    ).toBe(true);
    expect(classifyEncryptionKey(process.env.ENCRYPTION_KEY)).toBeNull();
  });

  it('refuses to boot in production with a placeholder key', () => {
    process.env.ENCRYPTION_KEY = 'your-32-char-random-encryption-key-here';

    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      validateEncryptionKey({
        envPath,
        countStoredCredentials: () => 0,
        nodeEnv: 'production',
      }),
    ).toThrow('process.exit called');

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.mock.calls.join('')).toContain('VIMO REFUSED TO START');
  });

  it('refuses to boot in production with a missing key even when no credentials exist', () => {
    delete process.env.ENCRYPTION_KEY;

    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      validateEncryptionKey({
        envPath,
        countStoredCredentials: () => 0,
        nodeEnv: 'production',
      }),
    ).toThrow('process.exit called');
  });

  /**
   * The critical safety property: never rotate a key out from under stored
   * ciphertext. Auto-healing here would permanently destroy the user's
   * connected accounts.
   */
  it('refuses to rotate the key when credentials already exist, even in development', () => {
    process.env.ENCRYPTION_KEY = 'change-this-to-a-random-32-character-string';

    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      validateEncryptionKey({
        envPath,
        countStoredCredentials: () => 3,
        nodeEnv: 'development',
      }),
    ).toThrow('process.exit called');

    const output = stderr.mock.calls.join('');
    expect(output).toContain('3 encrypted credential(s)');
    // The weak key must be left exactly as-is so the operator can restore theirs.
    expect(process.env.ENCRYPTION_KEY).toBe('change-this-to-a-random-32-character-string');
  });

  it('fails closed when the credential count cannot be read', () => {
    process.env.ENCRYPTION_KEY = '';

    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      validateEncryptionKey({
        envPath,
        countStoredCredentials: () => {
          throw new Error('database is locked');
        },
        nodeEnv: 'development',
      }),
    ).toThrow('process.exit called');

    expect(stderr.mock.calls.join('')).toContain('database is locked');
  });

  it('still boots when .env cannot be written, using the in-memory key', () => {
    process.env.ENCRYPTION_KEY = 'changeme';

    const generated = validateEncryptionKey({
      // A path inside a non-existent directory: the write throws, the boot continues.
      envPath: path.join(tmpDir, 'no-such-dir', '.env'),
      countStoredCredentials: () => 0,
      nodeEnv: 'development',
    });

    expect(generated).toBe(true);
    expect(classifyEncryptionKey(process.env.ENCRYPTION_KEY)).toBeNull();
  });
});
