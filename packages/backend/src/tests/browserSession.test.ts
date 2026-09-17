/**
 * Browser sessions — persistent logins with human-gated writes.
 *
 * A fake Chromium backend stands in for Playwright (no real browser in the
 * suite). The approval flow runs against the real in-memory approval service:
 * first write creates a request and refuses to act, approval unlocks it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

import {
  setBrowserBackendForTests,
  setSessionsRootForTests,
  launchSession,
  closeSession,
  closeAllSessions,
  listSessions,
  deleteSession,
  readPage,
  loginStatus,
  writeAction,
  type BrowserBackend,
  type BrowserPageLike,
  type BrowserContextLike,
} from '../services/browserSessionService';
import { approveRequest } from '../services/approvalService';

function makeFakeBackend(): BrowserBackend & { actions: string[] } {
  const actions: string[] = [];
  const page: BrowserPageLike = {
    async goto(url: string) {
      actions.push(`goto:${url}`);
    },
    async title() {
      return 'Fake Profile Page';
    },
    url() {
      return 'https://x.com/home';
    },
    async content() {
      return '<html><body><p>Latest posts from people you follow appear here in the timeline view today.</p></body></html>';
    },
    async click(selector: string) {
      actions.push(`click:${selector}`);
    },
    async fill(selector: string, text: string) {
      actions.push(`fill:${selector}:${text}`);
    },
    async press(selector: string, key: string) {
      actions.push(`press:${selector}:${key}`);
    },
    async screenshot() {
      return Buffer.from('fake-png');
    },
  };
  const ctx: BrowserContextLike = {
    async newPage() {
      return page;
    },
    async cookies() {
      return [{ domain: '.x.com', name: 'auth_token' }];
    },
    async close() {},
  };
  return {
    actions,
    async launchPersistentContext(_dir: string, _opts: { headless: boolean }) {
      actions.push('launch');
      return ctx;
    },
  };
}

let fake: ReturnType<typeof makeFakeBackend>;
let tmpRoot: string;

beforeEach(async () => {
  await closeAllSessions();
  setSessionsRootForTests(null);
  fake = makeFakeBackend();
  setBrowserBackendForTests(fake);
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vimo-browser-'));
  setSessionsRootForTests(tmpRoot);
});

describe('browser sessions', () => {
  it('launches, lists, reads, and closes — profile survives close', async () => {
    await launchSession('x-main', { headless: true, label: 'X main' });
    const sessions = listSessions();
    expect(sessions.find((s) => s.key === 'x-main')?.label).toBe('X main');
    expect(sessions.find((s) => s.key === 'x-main')?.launched).toBe(true);

    const snap = await readPage('x-main', 'https://x.com/home');
    expect(snap.title).toBe('Fake Profile Page');
    expect(snap.text).toContain('Latest posts');

    await closeSession('x-main');
    // Profile dir stays on disk → the login survives.
    expect(fs.existsSync(path.join(tmpRoot, 'x-main'))).toBe(true);
    expect(listSessions().find((s) => s.key === 'x-main')?.launched).toBe(false);
  });

  it('reports login status from stored cookies', async () => {
    await launchSession('x-main', { headless: true });
    const status = await loginStatus('x-main', ['x.com']);
    expect(status.loggedIn).toBe(true);
    expect(status.cookieCount).toBe(1);
    const cold = await loginStatus('x-main', ['instagram.com']);
    expect(cold.loggedIn).toBe(false);
  });

  it('gates writes behind human approval', async () => {
    await launchSession('x-main', { headless: true });

    // No approval: creates a request, touches nothing.
    const first = await writeAction(
      'x-main',
      { kind: 'click', selector: '#post-button' },
      { requestedBy: 'test', brandProfileId: '' },
    );
    expect(first.decision).toBe('pending');
    expect(fake.actions).not.toContain('click:#post-button');
    const approvalId = first.decision === 'pending' ? first.approvalRequestId : '';
    expect(approvalId).toBeTruthy();

    // Still pending while the human hasn't decided.
    const waiting = await writeAction(
      'x-main',
      { kind: 'click', selector: '#post-button' },
      { approvalRequestId: approvalId },
    );
    expect(waiting.decision).toBe('pending');

    // Approved: the click executes and a snapshot comes back.
    await approveRequest(approvalId);
    const done = await writeAction(
      'x-main',
      { kind: 'click', selector: '#post-button' },
      { approvalRequestId: approvalId },
    );
    expect(done.decision).toBe('executed');
    expect(fake.actions).toContain('click:#post-button');
  });

  it('deletes the profile on forget', async () => {
    await launchSession('x-temp', { headless: true });
    await deleteSession('x-temp');
    expect(fs.existsSync(path.join(tmpRoot, 'x-temp'))).toBe(false);
    expect(listSessions().find((s) => s.key === 'x-temp')).toBeUndefined();
  });
});
