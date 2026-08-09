/**
 * Migration: Team mode fields
 * - user_profiles.role — workspace role ('owner' | 'admin' | 'editor' | 'viewer')
 *   for team-mode workspaces. Defaults to 'owner' for the primary user.
 */

import Database from 'better-sqlite3';

export function addTeamFields(db: Database.Database): void {
  console.log('🔄 Running team fields migration...');

  const columns = db.prepare(`PRAGMA table_info('user_profiles')`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'");
    console.log('  ✓ Added column: user_profiles.role');
  } else {
    console.log('  ✓ Column user_profiles.role already exists');
  }

  console.log('✓ Team fields migration completed!');
}

export function rollbackTeamFields(): void {
  console.log('⏮ Team fields rollback not supported for SQLite (columns cannot be dropped).');
}
