/**
 * Browser Session Service — persistent, stay-logged-in browser profiles.
 *
 * The problem it solves: social logins (X, Instagram, TikTok, Reddit) die
 * with OAuth tokens and captchas. This service keeps one real Chromium
 * profile per session key on disk (`<data>/browser-sessions/<key>`), so the
 * user logs in ONCE in a visible window and the agent reuses that login
 * headlessly afterwards — cookies, localStorage and all.
 *
 * Human-in-the-loop contract (matches the approval queue UI):
 * - READ actions (goto + snapshot) are agent-usable with no approval.
 * - WRITE actions (click / type / keypress) need an approved approval
 *   request. Call without one and the service CREATES the request and
 *   returns `pending` with the id — the user approves in the Approvals
 *   queue, the agent retries with the id, the action executes.
 *
 * The Playwright backend is injectable so tests run with a fake (no real
 * Chromium anywhere in the suite).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright-core';
import { db } from '../db';
import { approvalRequests, appSettings } from '../db/schema';
import { requestApproval } from './approvalService';

/* ------------------------------------------------------------------ */
/*  Backend seam (real Chromium vs test fake)                          */
/* ------------------------------------------------------------------ */

export interface BrowserPageLike {
  goto(url: string): Promise<void>;
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  screenshot(): Promise<Buffer>;
}

export interface BrowserContextLike {
  newPage(): Promise<BrowserPageLike>;
  cookies(): Promise<Array<{ domain: string; name: string }>>;
  close(): Promise<void>;
}

export interface BrowserBackend {
  launchPersistentContext(
    dir: string,
    opts: { headless: boolean },
  ): Promise<BrowserContextLike>;
}

const realBackend: BrowserBackend = {
  async launchPersistentContext(dir: string, opts: { headless: boolean }) {
    const ctx = await chromium.launchPersistentContext(dir, {
      headless: opts.headless,
      viewport: { width: 1280, height: 800 },
    });
    return ctx as unknown as BrowserContextLike;
  },
};

let backend: BrowserBackend = realBackend;

/** Tests only: swap the Chromium backend for a fake. */
export function setBrowserBackendForTests(fake: BrowserBackend | null): void {
  backend = fake || realBackend;
}

/* ------------------------------------------------------------------ */
/*  Session storage                                                    */
/* ------------------------------------------------------------------ */

let sessionsRootOverride: string | null = null;

/** Tests only: redirect profile storage to a temp dir. */
export function setSessionsRootForTests(dir: string | null): void {
  sessionsRootOverride = dir;
}

function dataDir(): string {
  const dbPath = process.env.DB_PATH || './data/vimo.db';
  if (dbPath === ':memory:') return path.join(os.tmpdir(), 'vimo-test-data');
  return path.dirname(dbPath);
}

export function sessionsRoot(): string {
  return sessionsRootOverride || path.join(dataDir(), 'browser-sessions');
}

function safeKey(key: string): string {
  const clean = key.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 48);
  if (!clean) throw new Error('Session key must not be empty.');
  return clean;
}

function profileDir(key: string): string {
  return path.join(sessionsRoot(), safeKey(key));
}

export interface BrowserSessionMeta {
  key: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  lastUrl: string;
  launched: boolean;
  profileExists: boolean;
}

function metaKey(key: string): string {
  return `browser-session:${safeKey(key)}`;
}

function readMeta(key: string): Omit<BrowserSessionMeta, 'launched' | 'profileExists'> | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, metaKey(key))).get();
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function writeMeta(key: string, meta: Omit<BrowserSessionMeta, 'launched' | 'profileExists'>): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, metaKey(key))).get();
  const value = JSON.stringify(meta);
  if (existing) {
    db.update(appSettings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(appSettings.key, metaKey(key)))
      .run();
  } else {
    db.insert(appSettings).values({ key: metaKey(key), value, updatedAt: new Date().toISOString() }).run();
  }
}

function deleteMeta(key: string): void {
  db.delete(appSettings).where(eq(appSettings.key, metaKey(key))).run();
}

function touchMeta(key: string, label: string | undefined, lastUrl: string): void {
  const now = new Date().toISOString();
  const prev = readMeta(key);
  writeMeta(key, {
    key: safeKey(key),
    label: label || prev?.label || safeKey(key),
    createdAt: prev?.createdAt || now,
    lastUsedAt: now,
    lastUrl,
  });
}

/* ------------------------------------------------------------------ */
/*  Live contexts (one per key, process-local)                         */
/* ------------------------------------------------------------------ */

const live = new Map<string, BrowserContextLike>();

export function isLaunched(key: string): boolean {
  return live.has(safeKey(key));
}

export async function launchSession(
  key: string,
  opts: { headless?: boolean; label?: string } = {},
): Promise<{ key: string; headless: boolean; relaunched: boolean }> {
  const k = safeKey(key);
  const headless = opts.headless !== false; // default headless (background)
  if (live.has(k)) return { key: k, headless, relaunched: false };
  fs.mkdirSync(profileDir(k), { recursive: true });
  const ctx = await backend.launchPersistentContext(profileDir(k), { headless });
  live.set(k, ctx);
  touchMeta(k, opts.label, '');
  return { key: k, headless, relaunched: true };
}

export async function closeSession(key: string): Promise<{ key: string; wasOpen: boolean }> {
  const k = safeKey(key);
  const ctx = live.get(k);
  if (!ctx) return { key: k, wasOpen: false };
  live.delete(k);
  await ctx.close(); // profile stays on disk → stays logged in
  return { key: k, wasOpen: true };
}

/** Tests/shutdown only: close everything without wiping profiles. */
export async function closeAllSessions(): Promise<void> {
  for (const key of [...live.keys()]) await closeSession(key);
}

export function listSessions(): BrowserSessionMeta[] {
  const rows = db
    .select()
    .from(appSettings)
    .all()
    .filter((r) => r.key.startsWith('browser-session:'));
  return rows.map((r) => {
    let parsed: any = {};
    try {
      parsed = JSON.parse(r.value);
    } catch {
      parsed = {};
    }
    const k = String(parsed.key || r.key.replace('browser-session:', ''));
    return {
      key: k,
      label: String(parsed.label || k),
      createdAt: String(parsed.createdAt || ''),
      lastUsedAt: String(parsed.lastUsedAt || ''),
      lastUrl: String(parsed.lastUrl || ''),
      launched: live.has(k),
      profileExists: fs.existsSync(profileDir(k)),
    };
  });
}

export async function deleteSession(key: string): Promise<{ key: string }> {
  const k = safeKey(key);
  await closeSession(k);
  fs.rmSync(profileDir(k), { recursive: true, force: true });
  deleteMeta(k);
  return { key: k };
}

/* ------------------------------------------------------------------ */
/*  Reads (no approval needed)                                         */
/* ------------------------------------------------------------------ */

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
}

function textFromHtml(html: string, maxChars = 4000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxChars);
}

async function activePage(key: string): Promise<BrowserPageLike> {
  const ctx = live.get(safeKey(key));
  if (!ctx) throw new Error(`Browser session "${key}" is not launched. Launch it first.`);
  return ctx.newPage();
}

export async function readPage(key: string, url: string): Promise<PageSnapshot> {
  const k = safeKey(key);
  if (!live.has(k)) await launchSession(k, { headless: true });
  const page = await activePage(k);
  await page.goto(url);
  const [title, html] = [await page.title(), await page.content()];
  const snapshot = { url: page.url() || url, title, text: textFromHtml(html) };
  const prev = readMeta(k);
  touchMeta(k, prev?.label, snapshot.url);
  return snapshot;
}

export async function takeScreenshot(key: string): Promise<{ base64: string }> {
  const page = await activePage(key);
  const buf = await page.screenshot();
  return { base64: Buffer.from(buf).toString('base64') };
}

export async function loginStatus(
  key: string,
  domains: string[],
): Promise<{ key: string; loggedIn: boolean; cookieCount: number; matchedDomains: string[] }> {
  const k = safeKey(key);
  if (!live.has(k)) {
    return { key: k, loggedIn: false, cookieCount: 0, matchedDomains: [] };
  }
  const ctx = live.get(k)!;
  const cookies = await ctx.cookies();
  const matched = new Set<string>();
  let count = 0;
  for (const c of cookies) {
    const hit = domains.find((d) => c.domain.includes(d));
    if (hit) {
      count += 1;
      matched.add(hit);
    }
  }
  return { key: k, loggedIn: count > 0, cookieCount: count, matchedDomains: [...matched] };
}

/* ------------------------------------------------------------------ */
/*  Writes (approval-gated)                                            */
/* ------------------------------------------------------------------ */

export type BrowserWriteKind = 'click' | 'type' | 'keypress';

export interface BrowserWriteAction {
  kind: BrowserWriteKind;
  selector: string;
  text?: string;
  key?: string;
  url?: string;
}

export type BrowserWriteResult =
  | { decision: 'executed'; snapshot: PageSnapshot }
  | { decision: 'pending'; approvalRequestId: string; message: string }
  | { decision: 'rejected'; message: string };

function approvalStatus(id: string): string | null {
  const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
  return row?.status || null;
}

export async function writeAction(
  key: string,
  action: BrowserWriteAction,
  opts: { approvalRequestId?: string; requestedBy?: string; brandProfileId?: string } = {},
): Promise<BrowserWriteResult> {
  const k = safeKey(key);
  const status = opts.approvalRequestId ? approvalStatus(opts.approvalRequestId) : null;

  if (status === 'approved' || status === 'auto_approved') {
    if (!live.has(k)) await launchSession(k, { headless: true });
    const page = await activePage(k);
    if (action.url) await page.goto(action.url);
    if (action.kind === 'click') await page.click(action.selector);
    else if (action.kind === 'type') await page.fill(action.selector, action.text || '');
    else await page.press(action.selector, action.key || 'Enter');
    const snapshot = {
      url: page.url(),
      title: await page.title(),
      text: textFromHtml(await page.content()),
    };
    const prev = readMeta(k);
    touchMeta(k, prev?.label, snapshot.url);
    return { decision: 'executed', snapshot };
  }

  if (status === 'pending') {
    return {
      decision: 'pending',
      approvalRequestId: opts.approvalRequestId!,
      message: 'Still waiting for human approval. Approve it in the Approvals queue, then retry.',
    };
  }
  if (status === 'rejected' || status === 'expired') {
    return { decision: 'rejected', message: `Approval request was ${status}. Nothing was clicked or typed.` };
  }

  // No (valid) approval: create one and ask the human. Uses the director
  // channel because browser writes can do anything a click can do.
  const created = await requestApproval({
    requestType: 'execute_director_action',
    payload: {
      browserSession: k,
      browserAction: { kind: action.kind, selector: action.selector, url: action.url || null },
      note: 'Agent wants to operate the persistent browser. Approve to allow this click/type.',
    },
    brandProfileId: opts.brandProfileId || '',
    requestedBy: opts.requestedBy || 'browser-agent',
    urgency: 'immediate',
  });
  if (created.decision === 'approved') {
    return writeAction(key, action, { ...opts, approvalRequestId: created.approvalRequestId });
  }
  return {
    decision: 'pending',
    approvalRequestId: created.approvalRequestId,
    message: 'Needs a human first. Approval request created — approve it in the Approvals queue, then retry with this id.',
  };
}
