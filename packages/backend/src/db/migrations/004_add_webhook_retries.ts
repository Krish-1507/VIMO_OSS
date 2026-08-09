/**
 * Migration: Webhook delivery retry queue
 * - webhook_retries — pending deliveries for webhook events that failed the
 *   first attempt. Rows are drained with exponential backoff until success
 *   or the attempt budget is exhausted.
 */

import Database from 'better-sqlite3';

export function addWebhookRetries(db: Database.Database): void {
  console.log('🔄 Running webhook retries migration...');

  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'webhook_retries'")
    .get();
  if (existing) {
    console.log('  ✓ webhook_retries table already exists');
    return;
  }

  db.exec(`
    CREATE TABLE webhook_retries (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      url TEXT NOT NULL,
      body_json TEXT NOT NULL,
      signature TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  console.log('  ✓ Created table: webhook_retries');
  console.log('✓ Webhook retries migration completed!');
}

export function rollbackWebhookRetries(): void {
  console.log('⏮ Webhook retries rollback not supported for SQLite (tables cannot be dropped safely).');
}
