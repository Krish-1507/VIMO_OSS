import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'vimo.mjs');
const NODE = process.execPath;

test('--version prints the package version', () => {
  const res = spawnSync(NODE, [BIN, '--version'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^vimo \d+\.\d+\.\d+/);
});

test('--help explains usage and flags without starting anything', () => {
  const res = spawnSync(NODE, [BIN, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage: vimo/);
  assert.match(res.stdout, /--no-open/);
  assert.match(res.stdout, /--repo/);
  assert.match(res.stdout, /--update/);
  assert.match(res.stdout, /--doctor/);
});

test('--doctor reports environment checks without starting servers', () => {
  const res = spawnSync(NODE, [BIN, '--doctor'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Node\.js/);
  assert.match(res.stdout, /npm/);
}, 60_000);

test('rejects a --repo path that is not a VIMO checkout', () => {
  const res = spawnSync(NODE, [BIN, '--repo', os.tmpdir()], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env },
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr || res.stdout, /not a VIMO checkout/);
});
