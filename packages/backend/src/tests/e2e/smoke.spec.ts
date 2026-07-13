import { test, expect } from '@playwright/test';

/**
 * Smoke e2e: boot app → Demo brand → run Director.
 *
 * This is the one Playwright test we ship first. It proves the full stack
 * comes up and the Marketing Director — the orchestration users feel break —
 * actually runs and persists a session against the real backend.
 *
 * The app enforces a session gate, so the test performs the first-run setup
 * flow (set a PIN, then verify it) to obtain a session token and uses it on
 * every API call. State-changing calls also need the double-submit CSRF token
 * (sent equal to the session token), matching the backend's auth hook.
 */
const PIN = '123456';

test('boot app → Demo brand → run Director', async ({ request, page }) => {
  // 1) Boot: the SPA is served and the API is reachable through Vite's proxy.
  const home = await page.goto('/');
  expect(home?.status()).toBeLessThan(400);

  // 2) First-run setup: set a PIN, then verify it to obtain a session token.
  const setupRes = await request.post('/api/auth/setup', { data: { pin: PIN } });
  expect(setupRes.ok(), 'auth setup should succeed').toBeTruthy();

  const verifyRes = await request.post('/api/auth/verify', { data: { pin: PIN } });
  expect(verifyRes.ok(), 'auth verify should succeed').toBeTruthy();
  const { token } = (await verifyRes.json()) as { token?: string };
  expect(token, 'session token should be returned').toBeTruthy();

  const authHeaders = {
    'x-session-token': token as string,
    'x-csrf-token': token as string,
  };

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
      { headers: { 'x-session-token': token as string } },
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
