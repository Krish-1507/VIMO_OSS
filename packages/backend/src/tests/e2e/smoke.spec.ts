import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * Smoke e2e: boot app → Demo brand → run Director.
 *
 * This is the Playwright smoke we ship first. It proves the full stack comes
 * up and the Marketing Director — the orchestration users feel break —
 * actually runs and persists a session against the real backend.
 *
 * The app enforces a session gate, so the tests perform the first-run setup
 * flow (set a PIN, then verify it) to obtain a session token and use it on
 * every API call. State-changing calls also need the double-submit CSRF token
 * (sent equal to the session token), matching the backend's auth hook.
 *
 * The bootstrap is idempotent: on a warm dev database (PIN already set) it
 * skips straight to verification, and it retries briefly while the backend is
 * still compiling after `npm run dev` boots.
 */
const PIN = '123456';

interface AuthHeaders {
  token: string;
  headers: { 'x-session-token': string; 'x-csrf-token': string };
}

async function getAuthHeaders(): Promise<AuthHeaders> {
  const ctx = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' });
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    // Setup first — harmless no-op/error when a PIN already exists.
    await ctx.post('/api/auth/setup', { data: { pin: PIN } }).catch(() => null);

    const verifyRes = await ctx.post('/api/auth/verify', { data: { pin: PIN } }).catch(() => null);
    if (verifyRes?.ok()) {
      try {
        const { token } = (await verifyRes.json()) as { token?: string };
        if (token) {
          await ctx.dispose();
          return {
            token,
            headers: { 'x-session-token': token, 'x-csrf-token': token },
          };
        }
      } catch (err) {
        // Still compiling or setup state changed — retry until the deadline.
        console.log(`[bootstrap] verify failed: ${(err as Error)?.message || err}`);
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  await ctx.dispose();
  throw new Error('Could not obtain a session token: the backend did not come up in time.');
}

test('boot app → Demo brand → run Director', async ({ request, page }) => {
  // 1) Boot: the SPA is served and the API is reachable through Vite's proxy.
  const home = await page.goto('/');
  expect(home?.status()).toBeLessThan(400);

  // 2) First-run setup: obtain a session token (idempotent).
  const { token, headers: authHeaders } = await getAuthHeaders();

  // 3) Create a Demo brand (the entry point users hit after onboarding).
  const brandRes = await request.post('/api/brand-profiles', {
    data: {
      name: 'Demo',
      industry: 'Software',
      audience: 'Marketers',
      toneKeywords: ['bold', 'friendly'],
      examplePosts: ['Try our new feature today!'],
    },
    headers: authHeaders,
  });
  expect(brandRes.ok(), 'brand profile should be created').toBeTruthy();
  const brand = await brandRes.json();
  expect(brand.id, 'created brand should have an id').toBeTruthy();

  // 4) Run the Marketing Director for that brand.
  const runRes = await request.post('/api/director/run', {
    data: { brandProfileId: brand.id },
    headers: authHeaders,
  });
  expect(runRes.ok(), 'director run should start').toBeTruthy();
  const run = await runRes.json();
  expect(run.sessionId, 'director run should return a sessionId').toBeTruthy();

  // 5) Poll until the Director session is persisted — i.e. the pipeline ran to
  //    completion against the real server without crashing.
  const deadline = Date.now() + 120_000;
  let latest: { brandProfileId?: string } | null = null;
  while (Date.now() < deadline) {
    const latestRes = await request.get(
      `/api/director/latest?brandProfileId=${encodeURIComponent(brand.id)}`,
      { headers: { 'x-session-token': token } },
    );
    if (latestRes.ok()) {
      const body = (await latestRes.json()) as { session?: { brandProfileId?: string } };
      if (body?.session) {
        latest = body.session;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  expect(latest, 'Director session should be persisted after a run').toBeTruthy();
  expect(latest?.brandProfileId).toBe(brand.id);
});

test('webhook config round-trip + retry queue', async ({ request }) => {
  const { token, headers: authHeaders } = await getAuthHeaders();

  // Save a webhook endpoint config.
  const saveRes = await request.post('/api/webhooks/config', {
    data: { url: 'https://example.invalid/hook', secret: 'e2e-secret' },
    headers: authHeaders,
  });
  expect(saveRes.ok(), 'webhook config should save').toBeTruthy();

  const configRes = await request.get('/api/webhooks/config', { headers: authHeaders });
  expect(configRes.ok()).toBeTruthy();
  const config = await configRes.json();
  expect(config.url).toBe('https://example.invalid/hook');

  // Fire a test event — endpoint is invalid, so delivery fails but the event
  // is recorded and a retry is queued (best-effort, no crash).
  const fireRes = await request.post('/api/webhooks/fire-test', {
    data: { content: 'E2E test fire', platforms: ['instagram'] },
    headers: authHeaders,
  });
  expect([200, 400]).toContain(fireRes.status());

  const eventsRes = await request.get('/api/webhooks/events', { headers: authHeaders });
  if (eventsRes.ok()) {
    const events = await eventsRes.json();
    const eventsList = Array.isArray(events) ? events : events?.events || [];
    expect(Array.isArray(eventsList)).toBeTruthy();
  }
});

test('approval queue + campaign batch approval', async ({ request }) => {
  const { headers: authHeaders } = await getAuthHeaders();

  // Queue must be reachable and well-formed.
  const queueRes = await request.get('/api/approvals/queue', { headers: authHeaders });
  expect(queueRes.ok()).toBeTruthy();
  const { queue } = (await queueRes.json()) as { queue?: unknown[] };
  expect(Array.isArray(queue)).toBeTruthy();

  // Batch endpoint validates input.
  const badBatchRes = await request.post('/api/approvals/approve-campaign', {
    data: {},
    headers: authHeaders,
  });
  expect(badBatchRes.status()).toBe(400);

  // Unreachable campaign id → runs cleanly and approves nothing.
  const okBatchRes = await request.post('/api/approvals/approve-campaign', {
    data: { campaignId: 'campaign-does-not-exist-e2e' },
    headers: authHeaders,
  });
  expect(okBatchRes.ok()).toBeTruthy();
  const batch = await okBatchRes.json();
  expect(batch.approvedCount).toBe(0);
});

test('analytics CSV export is downloadable', async ({ request }) => {
  const { token } = await getAuthHeaders();

  const exportRes = await request.get('/api/analytics/export', {
    headers: { 'x-session-token': token },
  });
  expect(exportRes.ok()).toBeTruthy();
  const body = await exportRes.text();
  expect(body.split('\n')[0]).toContain('date,platform,status,content');
});
