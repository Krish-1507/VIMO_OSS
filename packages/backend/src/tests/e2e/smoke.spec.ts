import { test, expect } from '@playwright/test';

/**
 * Smoke e2e: boot app → Demo brand → run Director.
 *
 * This is the one Playwright test we ship first. It proves the full stack
 * comes up and the Marketing Director — the orchestration users feel break —
 * actually runs and persists a session against the real backend.
 */
test('boot app → Demo brand → run Director', async ({ request, page }) => {
  // 1) Boot: the SPA is served and the API is reachable through Vite's proxy.
  const home = await page.goto('/');
  expect(home?.status()).toBeLessThan(400);

  // 2) Create a Demo brand (the entry point users hit after onboarding).
  const brandRes = await request.post('/api/brand-profiles', {
    data: {
      name: 'Demo',
      industry: 'Software',
      audience: 'Marketers',
      toneKeywords: ['bold', 'friendly'],
      examplePosts: ['Try our new feature today!'],
    },
  });
  expect(brandRes.ok(), 'brand profile should be created').toBeTruthy();
  const brand = await brandRes.json();
  expect(brand.id, 'created brand should have an id').toBeTruthy();

  // 3) Run the Marketing Director for that brand.
  const runRes = await request.post('/api/director/run', {
    data: { brandProfileId: brand.id },
  });
  expect(runRes.ok(), 'director run should start').toBeTruthy();
  const run = await runRes.json();
  expect(run.sessionId, 'director run should return a sessionId').toBeTruthy();

  // 4) Poll until the Director session is persisted — i.e. the pipeline ran to
  //    completion against the real server without crashing.
  const deadline = Date.now() + 120_000;
  let latest: { brandProfileId?: string } | null = null;
  while (Date.now() < deadline) {
    const latestRes = await request.get(
      `/api/director/latest?brandProfileId=${encodeURIComponent(brand.id)}`,
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
