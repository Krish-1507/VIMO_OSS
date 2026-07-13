import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Shared setup: isolated in-memory DB + test encryption key.
    setupFiles: ['./src/tests/setup.ts'],
    // Prevent Vitest from executing compiled dist test files (CommonJS) that break ESM.
    include: ['src/tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**', 'src/tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Gate the critical user-facing paths. These are the modules users feel
      // break, so a drop below threshold fails CI and protects the moat.
      // (Other modules are still tested; they just aren't part of the gate.)
      include: [
        'src/services/approvalService.ts',
        'src/services/publishService.ts',
        'src/server/integrations/engine.ts',
        'src/agents/marketingDirector.ts',
      ],
      exclude: ['src/tests/**'],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        // Branch coverage on the orchestration code (esp. Marketing Director)
        // is harder to raise without a live LLM, so it is gated a little lower.
        // Lines/statements/functions are the 60% moat that fails CI.
        branches: 40,
      },
    },
  },
});
