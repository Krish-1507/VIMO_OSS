import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';
import { addEngagementFields } from './migrations/002_add_engagement_fields';

const dbPath = process.env.DB_PATH || './data/vimo.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);

// Run schema sync to create tables if they don't exist
const existing = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get();
if (!existing) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT DEFAULT 'inactive' NOT NULL,
      config_json TEXT NOT NULL,
      encrypted_credentials TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brand_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT NOT NULL,
      audience TEXT NOT NULL,
      tone_keywords_json TEXT NOT NULL,
      example_posts_json TEXT NOT NULL,
      voice_fingerprint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      brand_profile_id TEXT NOT NULL,
      channels_json TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      strategy TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      brand_profile_id TEXT NOT NULL,
      content TEXT NOT NULL,
      platform TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      media_urls_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      action TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      connectors_called TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS viral_jobs (
      id TEXT PRIMARY KEY,
      video_path TEXT NOT NULL,
      status TEXT DEFAULT 'queued' NOT NULL,
      transcript TEXT,
      moments_json TEXT,
      clips_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS engagement_queue (
      id TEXT PRIMARY KEY,
      brand_profile_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      external_post_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_handle TEXT,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'comment' NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      reply_content TEXT,
      confidence_score INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// Ensure engagement_queue table exists (may have been added after initial DB creation)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS engagement_queue (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    external_post_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_handle TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'comment' NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    reply_status TEXT,
    post_id TEXT,
    received_at TEXT,
    reply_content TEXT,
    confidence_score INTEGER,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

 // Run engagement fields migration on existing databases
addEngagementFields(sqlite);

// Growth loop: ensure scheduled_posts has is_high_performer_checked column
try {
  const cols = sqlite
    .prepare("PRAGMA table_info('scheduled_posts')")
    .all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  if (!existing.has('is_high_performer_checked')) {
    console.log('🔄 Adding scheduled_posts.is_high_performer_checked column...');
    sqlite.exec(`ALTER TABLE scheduled_posts ADD COLUMN is_high_performer_checked INTEGER`);
  }
} catch (err) {
  console.warn('⚠ Failed to ensure is_high_performer_checked column:', err);
}

// Ensure brand_profiles has website column
try {
  const bpCols2 = sqlite
    .prepare("PRAGMA table_info('brand_profiles')")
    .all() as Array<{ name: string }>;
  const bpExisting2 = new Set(bpCols2.map((c) => c.name));
  if (!bpExisting2.has('website')) {
    console.log('🔄 Adding brand_profiles.website column...');
    sqlite.exec(`ALTER TABLE brand_profiles ADD COLUMN website TEXT`);
  }
} catch (err) {
  console.warn('⚠ Failed to ensure website column:', err);
}

// Ensure brand_profiles has logo_url column
try {
  const bpLogoCols = sqlite
    .prepare("PRAGMA table_info('brand_profiles')")
    .all() as Array<{ name: string }>;
  const bpLogoExisting = new Set(bpLogoCols.map((c) => c.name));
  if (!bpLogoExisting.has('logo_url')) {
    console.log('🔄 Adding brand_profiles.logo_url column...');
    sqlite.exec(`ALTER TABLE brand_profiles ADD COLUMN logo_url TEXT`);
  }
} catch (err) {
  console.warn('⚠ Failed to ensure logo_url column:', err);
}

// Brand Memory: ensure brand_profiles has all memory columns
try {
  const bpCols = sqlite
    .prepare("PRAGMA table_info('brand_profiles')")
    .all() as Array<{ name: string }>;
  const bpExisting = new Set(bpCols.map((c) => c.name));
  const memoryColumns = ['memory_version', 'total_posts_generated', 'total_campaigns_run', 'performance_lessons', 'audience_insights', 'campaign_memory', 'content_dna', 'adaptive_plan'];
  for (const col of memoryColumns) {
    if (!bpExisting.has(col)) {
      console.log(`🔄 Adding brand_profiles.${col} column...`);
      const type = col === 'total_posts_generated' || col === 'total_campaigns_run' || col === 'memory_version' ? 'INTEGER' : 'TEXT';
      sqlite.exec(`ALTER TABLE brand_profiles ADD COLUMN ${col} ${type} DEFAULT ${col.includes('total_') || col === 'memory_version' ? '0' : 'NULL'}`);
    }
  }
} catch (err) {
  console.warn('⚠ Failed to ensure brand_profiles memory columns:', err);
}

// Demo Mode: ensure is_demo flag columns exist on the entities a demo
// workspace seeds (brand, connectors, analytics snapshots).
for (const table of ['brand_profiles', 'connectors', 'account_snapshots'] as const) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    if (!cols.map((c) => c.name).includes('is_demo')) {
      console.log(`🔄 Adding ${table}.is_demo column...`);
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN is_demo INTEGER DEFAULT 0`);
    }
  } catch (err) {
    console.warn(`⚠ Failed to ensure ${table}.is_demo column:`, err);
  }
}

export const db = drizzle(sqlite, { schema });

// Ensure engagement_queue table exists with new columns (idempotent)
try {
  sqlite.exec(`
    SELECT reply_status FROM engagement_queue LIMIT 1;
  `);
} catch {
  addEngagementFields(sqlite);
}

// Ensure user_profiles table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Ensure media table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    public_url TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure account_snapshots table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS account_snapshots (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    followers_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    posts_count INTEGER NOT NULL DEFAULT 0,
    snapshot_date TEXT NOT NULL,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// Ensure trend_signals table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS trend_signals (
    id TEXT PRIMARY KEY,
    signal_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source_url TEXT,
    relevance_score INTEGER NOT NULL,
    action_suggestion TEXT,
    is_acted_on INTEGER DEFAULT 0 NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Ensure competitor_profiles table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS competitor_profiles (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    competitor_name TEXT NOT NULL,
    platform_handle TEXT NOT NULL,
    platform TEXT NOT NULL,
    followers_count INTEGER,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure competitor_snapshots table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS competitor_snapshots (
    id TEXT PRIMARY KEY,
    competitor_profile_id TEXT NOT NULL,
    followers_count INTEGER,
    posts_this_week INTEGER,
    top_content_theme TEXT,
    avg_engagement_rate INTEGER,
    snapshot_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Ensure autopilot_sessions table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS autopilot_sessions (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    audience_description TEXT NOT NULL,
    primary_goal TEXT NOT NULL,
    goal_type TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    channels_json TEXT,
    status TEXT NOT NULL,
    progress_percent INTEGER DEFAULT 0 NOT NULL,
    strategy_document TEXT,
    content_calendar_json TEXT,
    scheduled_post_ids_json TEXT,
    log_json TEXT,
    start_date TEXT,
    end_date TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure autopilot_checkpoints table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS autopilot_checkpoints (
    id TEXT PRIMARY KEY,
    autopilot_id TEXT NOT NULL,
    check_date TEXT NOT NULL,
    check_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Ensure autopilot_sessions has timeline_json (structured, explainable activity log)
try {
  const apCols = sqlite
    .prepare("PRAGMA table_info('autopilot_sessions')")
    .all() as Array<{ name: string }>;
  const apExisting = new Set(apCols.map((c) => c.name));
  if (!apExisting.has('timeline_json')) {
    console.log('🔄 Adding autopilot_sessions.timeline_json column...');
    sqlite.exec(`ALTER TABLE autopilot_sessions ADD COLUMN timeline_json TEXT`);
  }
} catch (err) {
  console.warn('⚠ Failed to ensure autopilot_sessions.timeline_json column:', err);
}

// Ensure assistant_messages table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS assistant_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    intent_type TEXT,
    system_action_taken TEXT,
    system_action_result TEXT,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Ensure brand_roasts table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS brand_roasts (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    roast_json TEXT NOT NULL,
    overall_score INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Ensure notifications table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read TEXT NOT NULL DEFAULT 'false',
    action_url TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure director_sessions table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS director_sessions (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    research_report_json TEXT,
    analytics_insights_json TEXT,
    content_opportunities_json TEXT,
    engagement_stats_json TEXT,
    director_summary TEXT,
    recommended_actions_json TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure marketing_memory table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS marketing_memory (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    week_label TEXT NOT NULL,
    summary TEXT NOT NULL,
    metrics TEXT,
    sentiment TEXT NOT NULL DEFAULT 'neutral',
    tags TEXT,
    linked_entity_id TEXT,
    linked_entity_type TEXT,
    lessons_json TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure higgsfield_jobs table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS higgsfield_jobs (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL,
    brand_profile_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    style TEXT NOT NULL,
    reference_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    video_url TEXT,
    thumbnail_url TEXT,
    local_file_path TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
`);

// Ensure approval_requests table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    request_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    brand_profile_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    urgency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT,
    reviewed_by TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

// Ensure llm_usage table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS llm_usage (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    brand_profile_id TEXT,
    related_entity_id TEXT,
    related_entity_type TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure opportunities table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    potential_impact TEXT NOT NULL,
    urgency TEXT NOT NULL,
    action_label TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_payload_json TEXT NOT NULL,
    is_acted_on INTEGER DEFAULT 0 NOT NULL,
    detected_at TEXT NOT NULL,
    acted_on_at TEXT,
    created_at TEXT NOT NULL
  );
`);

// Ensure knowledge_entities table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_entities (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_label TEXT NOT NULL,
    properties TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_entities_brand_profile_id ON knowledge_entities (brand_profile_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type_label ON knowledge_entities (brand_profile_id, entity_type, entity_label);
`);

// Ensure installed_packs table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS installed_packs (
    id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    pack_name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand_profile_id TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    installed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_installed_packs_brand_profile_id ON installed_packs (brand_profile_id);
  CREATE INDEX IF NOT EXISTS idx_installed_packs_pack_id ON installed_packs (pack_id);
`);

// Ensure knowledge_relationships table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    from_entity_id TEXT NOT NULL,
    to_entity_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    strength REAL NOT NULL,
    sample_size INTEGER NOT NULL,
    last_observed TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_brand_profile_id ON knowledge_relationships (brand_profile_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_from ON knowledge_relationships (from_entity_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_to ON knowledge_relationships (to_entity_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_type ON knowledge_relationships (relationship_type);
  CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_unique ON knowledge_relationships (
    brand_profile_id, from_entity_id, to_entity_id, relationship_type
  );
`);

// Ensure director_sessions has morning_briefing_json column
try {
  const dsCols = sqlite
    .prepare("PRAGMA table_info('director_sessions')")
    .all() as Array<{ name: string }>;
  const dsExisting = new Set(dsCols.map((c) => c.name));
  if (!dsExisting.has('morning_briefing_json')) {
    console.log('🔄 Adding director_sessions.morning_briefing_json column...');
    sqlite.exec(`ALTER TABLE director_sessions ADD COLUMN morning_briefing_json TEXT`);
  }
} catch (err) {
  console.warn('⚠ Failed to add morning_briefing_json column:', err);
}

// Set default approval settings using key-value pattern (app_settings is a key-value store)
const defaultRules = JSON.stringify({
  maxAutoPostsPerDay: 5,
  requireApprovalForFirstPostOfDay: true,
  requireApprovalForPromoContent: true,
  autoApproveEngagementRepliesAboveConfidence: 85,
  blockedHours: [0, 1, 2, 3, 4, 5, 6],
});
try {
  const existingRules = sqlite.prepare("SELECT value FROM app_settings WHERE key = 'approvalRules'").get() as { value: string } | undefined;
  if (!existingRules) {
    sqlite.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('approvalRules', ?, ?)").run(defaultRules, new Date().toISOString());
  }
  const existingMode = sqlite.prepare("SELECT value FROM app_settings WHERE key = 'approvalMode'").get() as { value: string } | undefined;
  if (!existingMode) {
    sqlite.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('approvalMode', 'assisted', ?)").run(new Date().toISOString());
  }
} catch (err) {
  console.warn('⚠ Failed to set default approval settings:', err);
}

// Auto-fix: set any LLM connectors with inactive/error status to active
// (pre-existing connectors created before the LLM MCP-skip fix)
try {
  const llmFix = sqlite.prepare("UPDATE connectors SET status = 'active', updated_at = ? WHERE type = 'llm' AND status IN ('inactive', 'error')");
  const info = llmFix.run(new Date().toISOString());
  if (info.changes > 0) {
    console.log(`✓ Auto-fixed ${info.changes} LLM connector(s) to active status`);
  }
} catch (err) {
  console.warn('⚠ Failed to auto-fix LLM connector status:', err);
}

// Auto-create built-in free Pollinations.ai LLM connector if none exist
try {
  const existingLlms = sqlite.prepare("SELECT id FROM connectors WHERE type = 'llm'").all();
  if (existingLlms.length === 0) {
    console.log('🔄 No LLM connectors found — auto-creating built-in free Pollinations.ai connector...');
    const pollinationsId = 'built-in-pollinations';
    const now = new Date().toISOString();
    const pollinationsConfig = JSON.stringify({ aiType: 'text', builtIn: true });
    sqlite.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, type, provider, status, config_json, encrypted_credentials, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pollinationsId, 'Built-in Free (Pollinations.ai)', 'llm', 'pollinations', 'active', pollinationsConfig, '', now, now);
    console.log('✓ Created built-in Pollinations.ai connector (free, no API key needed)');
  }
} catch (err) {
  console.warn('⚠ Failed to auto-create built-in connector:', err);
}

// Ensure content_library table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS content_library (
    id TEXT PRIMARY KEY,
    brand_profile_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'social_post',
    platform TEXT,
    title TEXT,
    content TEXT NOT NULL,
    media_url TEXT,
    media_urls_json TEXT,
    metadata_json TEXT,
    status TEXT DEFAULT 'draft' NOT NULL,
    source TEXT DEFAULT 'ai_generated' NOT NULL,
    website_context_json TEXT,
    generated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_content_library_brand_profile_id ON content_library (brand_profile_id);
  CREATE INDEX IF NOT EXISTS idx_content_library_type ON content_library (type);
  CREATE INDEX IF NOT EXISTS idx_content_library_status ON content_library (status);
  CREATE INDEX IF NOT EXISTS idx_content_library_platform ON content_library (platform);
`);

// Credential validation: check if stored credentials can be decrypted
// If not, the encryption key was likely changed — clear them and deactivate the connector
try {
  const crypto2 = require('crypto');
  const envKey = process.env.ENCRYPTION_KEY || '';
  const key = crypto2.createHash('sha256').update(envKey).digest();
  
  function testDecrypt(encryptedString: string): boolean {
    try {
      const parts = encryptedString.split(':');
      if (parts.length !== 3) return false;
      const [ivHex, authTagHex, ciphertext] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto2.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      decipher.update(ciphertext, 'hex', 'utf8');
      decipher.final('utf8');
      return true;
    } catch {
      return false;
    }
  }

  // Test all credentials
  const credRows = sqlite.prepare("SELECT key FROM app_settings WHERE key LIKE 'cred:%'").all() as Array<{ key: string }>;
  let corruptedCount = 0;
  for (const row of credRows) {
    const cred = sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get(row.key) as { value: string } | undefined;
    if (!cred) continue;
    if (!testDecrypt(cred.value)) {
      // Credential can't be decrypted — clear it
      sqlite.prepare('DELETE FROM app_settings WHERE key = ?').run(row.key);
      corruptedCount++;
      // Also deactivate the associated connector
      const connectorId = row.key.replace('cred:', '').replace(':apiKey', '');
      sqlite.prepare("UPDATE connectors SET status = 'inactive', updated_at = ? WHERE id = ?").run(new Date().toISOString(), connectorId);
      console.warn(`⚠ Cleared undecryptable credential for connector ${connectorId}. Re-enter API key to reactivate.`);
    }
  }
  if (corruptedCount > 0) {
    console.log(`✓ Cleared ${corruptedCount} undecryptable credential(s). Please re-enter your API keys in Settings > AI Models.`);
  }

  // Clean up corrupted config_json: remove lastError/lastTestedAt fields
  const connRows = sqlite.prepare('SELECT id, config_json FROM connectors').all() as Array<{ id: string; config_json: string }>;
  for (const conn of connRows) {
    try {
      const cfg = JSON.parse(conn.config_json);
      if (cfg.lastError || cfg.lastTestedAt) {
        delete cfg.lastError;
        delete cfg.lastTestedAt;
        sqlite.prepare('UPDATE connectors SET config_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(cfg), new Date().toISOString(), conn.id);
      }
    } catch {
      // If config_json is malformed JSON, reset it
      sqlite.prepare('UPDATE connectors SET config_json = ?, updated_at = ? WHERE id = ?').run('{}', new Date().toISOString(), conn.id);
    }
  }
} catch (err) {
  console.warn('⚠ Failed to validate credentials:', err);
}
