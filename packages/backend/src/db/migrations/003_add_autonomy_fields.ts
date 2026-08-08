/**
 * Migration: Phase 2 autonomy fields
 * - scheduled_posts.social_account_id — which connected account a post
 *   publishes through (multi-account per platform)
 * - autopilot_sessions.max_posts_per_day — daily post cap guardrail
 * - autopilot_sessions.spend_cap_per_day — daily AI spend cap guardrail (USD)
 */

import Database from 'better-sqlite3';

const ADDITIONS: Array<{ table: string; name: string; definition: string }> = [
  {
    table: 'scheduled_posts',
    name: 'social_account_id',
    definition: 'ALTER TABLE scheduled_posts ADD COLUMN social_account_id TEXT',
  },
  {
    table: 'autopilot_sessions',
    name: 'max_posts_per_day',
    definition: 'ALTER TABLE autopilot_sessions ADD COLUMN max_posts_per_day INTEGER',
  },
  {
    table: 'autopilot_sessions',
    name: 'spend_cap_per_day',
    definition: 'ALTER TABLE autopilot_sessions ADD COLUMN spend_cap_per_day REAL',
  },
];

export function addAutonomyFields(db: Database.Database): void {
  console.log('🔄 Running autonomy fields migration...');

  for (const col of ADDITIONS) {
    try {
      const columns = db
        .prepare(`PRAGMA table_info('${col.table}')`)
        .all() as Array<{ name: string }>;
      if (columns.some((c) => c.name === col.name)) {
        console.log(`  ✓ Column ${col.table}.${col.name} already exists`);
        continue;
      }
      db.exec(col.definition);
      console.log(`  ✓ Added column: ${col.table}.${col.name}`);
    } catch (error) {
      console.warn(`  ⚠ Failed to add column ${col.table}.${col.name}: ${error}`);
    }
  }

  console.log('✓ Autonomy fields migration completed!');
}

export function rollbackAutonomyFields(): void {
  console.log('⏮ Autonomy fields rollback not supported for SQLite (columns cannot be dropped).');
}
