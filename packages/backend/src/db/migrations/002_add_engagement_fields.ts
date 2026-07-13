/**
 * Migration: Add engagement pipeline fields
 * - replyStatus: tracks the engagement pipeline state
 * - postId: links comment to Instagram post
 * - receivedAt: when the comment was received on the platform
 * - metadataJson: flexible JSON field for intent, replyId, sentiment, etc.
 */

import Database from 'better-sqlite3';

export function addEngagementFields(db: Database.Database): void {
  console.log('🔄 Running engagement fields migration...');

  const columns = db
    .prepare("PRAGMA table_info('engagement_queue')")
    .all() as Array<{ name: string }>;
  const existingColumnNames = new Set(columns.map((c) => c.name));

  const additions: Array<{ name: string; definition: string }> = [
    { name: 'reply_status', definition: "ALTER TABLE engagement_queue ADD COLUMN reply_status TEXT" },
    { name: 'post_id', definition: "ALTER TABLE engagement_queue ADD COLUMN post_id TEXT" },
    { name: 'received_at', definition: "ALTER TABLE engagement_queue ADD COLUMN received_at TEXT" },
    { name: 'metadata_json', definition: "ALTER TABLE engagement_queue ADD COLUMN metadata_json TEXT" },
  ];

  for (const col of additions) {
    if (!existingColumnNames.has(col.name)) {
      try {
        db.exec(col.definition);
        console.log(`  ✓ Added column: ${col.name}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to add column ${col.name}: ${error}`);
      }
    } else {
      console.log(`  ✓ Column ${col.name} already exists`);
    }
  }

  console.log('✓ Engagement fields migration completed!');
}

export function rollbackEngagementFields(db: Database.Database): void {
  console.log('⏮ Engagement fields rollback not supported for SQLite (columns cannot be dropped).');
}
