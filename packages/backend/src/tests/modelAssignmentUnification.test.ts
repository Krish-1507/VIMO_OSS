/**
 * Model switching unification — Settings picks must actually drive the agents.
 *
 * The Settings → AI Models screen writes `model_<task>` keys, but every
 * `getModelForTask` caller (campaigns, autopilot, content, engagement,
 * analytics, brand DNA) only read the legacy `modelAssignments` blob that
 * the UI never writes — so switching models silently did nothing for most
 * of the app. These tests lock in the unified priority:
 * legacy blob → UI per-task picks → capability auto-assign.
 *
 * Real in-memory DB, no network, no LLM calls (routing only).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, connectors } from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { TaskType, getModelForTask } from '../lib/modelRouter';
import { findTaskConnectorId } from '../lib/llmProvider';

const registry = new ConnectorRegistry(db);

function setSetting(key: string, value: string): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, updatedAt: now }).run();
  }
}

describe('model switching unification', () => {
  let groqId: string;
  let openaiId: string;

  beforeEach(async () => {
    db.delete(connectors).run();
    for (const key of [
      'model_content_generation',
      'model_campaign_strategy',
      'model content with spaces',
    ]) {
      db.delete(appSettings).where(eq(appSettings.key, key)).run();
    }
    const groq = await registry.create({
      name: 'Groq',
      type: 'llm' as any,
      provider: 'groq',
      status: 'active' as any,
      config: { modelName: 'llama-3.3-70b-versatile' },
    });
    const openai = await registry.create({
      name: 'OpenAI',
      type: 'llm' as any,
      provider: 'openai',
      status: 'active' as any,
      config: { modelName: 'gpt-4o-mini' },
    });
    groqId = groq.id;
    openaiId = openai.id;
  });

  it('routes CONTENT_GENERATION to the UI-picked connector', async () => {
    setSetting('model_content_generation', groqId);
    const route = await getModelForTask(TaskType.CONTENT_GENERATION);
    expect(route.connectorId).toBe(groqId);
    expect(route.provider).toBe('groq');
    expect(route.modelId).toBe('llama-3.3-70b-versatile');
  });

  it('routes STRATEGY to the campaign_strategy pick', async () => {
    setSetting('model_campaign_strategy', openaiId);
    const route = await getModelForTask(TaskType.STRATEGY);
    expect(route.connectorId).toBe(openaiId);
    expect(route.modelId).toBe('gpt-4o-mini');
  });

  it('falls back honestly when the picked connector is gone', async () => {
    setSetting('model_content_generation', 'deleted-connector-id');
    const route = await getModelForTask(TaskType.CONTENT_GENERATION);
    // Must still resolve to a live connector (or throw the honest no-provider
    // error) — never to the deleted id.
    expect(route.connectorId).not.toBe('deleted-connector-id');
    expect(await findTaskConnectorId('content_generation')).toBeNull();
  });

  it('aliases background task names to UI picks', async () => {
    setSetting('model_content_generation', groqId);
    // 'content strategy' has no UI row of its own; it must honor the
    // content_generation pick instead of silently using first-active.
    expect(await findTaskConnectorId('content strategy')).toBe(groqId);
  });
});
