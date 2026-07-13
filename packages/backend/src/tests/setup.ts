/**
 * Vitest setup for the backend suite.
 *
 * We run every test against an isolated in-memory SQLite database so the
 * connection-layer tests exercise VIMO's real logic (credential store,
 * connector registry, pack adapters) without touching the developer's
 * on-disk `./data/vimo.db`. Only the *external* APIs (Facebook Graph,
 * Shopify, GitHub, …) are mocked — VIMO's own code is never mocked.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'test-encryption-key-32chars-long!!';
