import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke e2e.
 *
 * Boots the whole app (`npm run dev` → Vite frontend on :5173 + Fastify
 * backend on :3000, with Vite proxying /api), then drives the single most
 * important user journey end-to-end through the real server:
 *
 *   boot app → create a Demo brand → run the Marketing Director →
 *   assert the director session was persisted.
 *
 * A green run here is the contributor catnip badge: the orchestration that
 * users feel break is verified against the actual running product, not mocks.
 */
export default defineConfig({
  testDir: './packages/backend/src/tests/e2e',
  timeout: 150_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
