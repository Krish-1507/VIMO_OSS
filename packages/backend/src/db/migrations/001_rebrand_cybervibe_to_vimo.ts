/**
 * Migration: Rebrand from CyberVibe to VIMO
 * - Renames all table prefixes from cybervibe_* to vimo_*
 * - Updates any stored values referencing the old branding
 * 
 * This migration runs automatically when the app detects the old schema version.
 * It is idempotent and safe to run multiple times.
 */

import Database from 'better-sqlite3';

export function migrateVibebranding(db: Database.Database): void {
  console.log('🔄 Running VIMO rebrand migration...');
  
  try {
    // Get all existing table names
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cybervibe_%'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log('✓ No cybervibe_ tables found. Schema is already migrated.');
      return;
    }

    console.log(`Found ${tables.length} tables to rename...`);

    // Rename each table
    for (const table of tables) {
      const oldName = table.name;
      const newName = oldName.replace(/^cybervibe_/, 'vimo_');
      
      try {
        db.exec(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
        console.log(`  ✓ ${oldName} → ${newName}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to rename ${oldName}: ${error}`);
      }
    }

    // Update any stored app_settings values that reference the old branding
    const settings = db.prepare('SELECT * FROM app_settings WHERE key LIKE ?').all('%cybervibe%') as any[];
    
    if (settings.length > 0) {
      const updateStmt = db.prepare('UPDATE app_settings SET value = ? WHERE key = ?');
      
      for (const setting of settings) {
        const oldValue = setting.value;
        let newValue = oldValue;
        
        // Replace any hardcoded references to cybervibe
        if (typeof oldValue === 'string') {
          newValue = oldValue
            .replace(/cybervibe/gi, 'vimo')
            .replace(/CyberVibe/g, 'VIMO')
            .replace(/cyber.?vibe/gi, 'vimo');
        } else if (typeof oldValue === 'object') {
          // If it's JSON, parse, update, and re-stringify
          try {
            let obj = JSON.parse(oldValue);
            const jsonStr = JSON.stringify(obj)
              .replace(/cybervibe/gi, 'vimo')
              .replace(/CyberVibe/g, 'VIMO');
            newValue = jsonStr;
          } catch (e) {
            // If not valid JSON, skip
            continue;
          }
        }
        
        if (newValue !== oldValue) {
          updateStmt.run(newValue, setting.key);
          console.log(`  ✓ Updated setting: ${setting.key}`);
        }
      }
    }

    console.log('✓ VIMO rebrand migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback function (optional) - for development/testing only
 * This reverts the rebrand migration back to cybervibe_ prefixes
 */
export function rollbackVibebranding(db: Database.Database): void {
  console.log('⏮ Rolling back VIMO rebrand migration...');
  
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vimo_%'"
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      console.log('✓ No vimo_ tables found. Schema is already at cybervibe version.');
      return;
    }

    for (const table of tables) {
      const oldName = table.name;
      const newName = oldName.replace(/^vimo_/, 'cybervibe_');
      
      try {
        db.exec(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
        console.log(`  ✓ ${oldName} → ${newName}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to rename ${oldName}: ${error}`);
      }
    }

    console.log('✓ Rollback completed successfully!');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
