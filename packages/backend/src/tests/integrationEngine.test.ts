/**
 * Integration Engine — registry-backed behavior.
 *
 * Verifies the engine now hosts *more than one* integration, persists the
 * connectionId → integration mapping, and that disconnect / health / invoke
 * actually route to the correct integration's deps (the previous
 * "best-effort" gap).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationEngine, type IntegrationEngineDeps } from '../server/integrations/engine';
import { integrationRegistry, registerBuiltInIntegrations } from '../server/integrations/registry';

function makeDeps(label: string): IntegrationEngineDeps & { disconnectSpy: ReturnType<typeof vi.fn> } {
  const disconnectSpy = vi.fn().mockResolvedValue(undefined);
  return {
    disconnectSpy,
    disconnect: disconnectSpy,
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue([{ name: `${label}_tool`, description: 'x' }]),
    callTool: vi.fn().mockResolvedValue({ ok: true }),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

describe('IntegrationEngine — registry-backed connect/disconnect', () => {
  it('connects, grants tools, and stores the integration mapping', async () => {
    const canva = makeDeps('canva');
    const engine = new IntegrationEngine(undefined, {
      resolveDeps: (catalogId) => (catalogId === 'canva_ai_designer' ? canva : null),
    });

    const conn = await engine.connectOneClick({
      connectionId: 'conn_1',
      catalogId: 'canva_ai_designer',
      displayName: 'AI Designer',
      connectorId: 'canva_connector',
      serverUrl: 'https://api.canva.com',
    });

    expect(conn.status).toBe('connected');
    expect(conn.grantedActions).toEqual(['canva_tool']);
    expect(canva.connect).toHaveBeenCalledWith('canva_connector', 'https://api.canva.com');

    // disconnect must reach the *correct* integration's deps.
    await engine.disconnect('conn_1');
    expect(canva.disconnectSpy).toHaveBeenCalledWith('canva_connector');
    expect(engine.getConnection('conn_1')?.status).toBe('disconnected');
  });

  it('hosts multiple integrations and disconnects only the targeted one', async () => {
    const canva = makeDeps('canva');
    const slack = makeDeps('slack');
    const engine = new IntegrationEngine(undefined, {
      resolveDeps: (catalogId) =>
        catalogId === 'canva_ai_designer' ? canva : catalogId === 'slack_mcp' ? slack : null,
    });

    await engine.connectOneClick({
      connectionId: 'conn_canva',
      catalogId: 'canva_ai_designer',
      displayName: 'AI Designer',
      connectorId: 'canva_connector',
      serverUrl: '',
    });
    await engine.connectOneClick({
      connectionId: 'conn_slack',
      catalogId: 'slack_mcp',
      displayName: 'Slack',
      connectorId: 'slack_connector',
      serverUrl: '',
    });

    await engine.disconnect('conn_canva');

    expect(canva.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(slack.disconnectSpy).not.toHaveBeenCalled();
    expect(engine.getConnection('conn_slack')?.status).toBe('connected');
  });

  it('throws when connecting an unregistered catalogId', async () => {
    const engine = new IntegrationEngine(undefined, { resolveDeps: () => null });
    await expect(
      engine.connectOneClick({
        connectionId: 'x',
        catalogId: 'nope',
        displayName: 'Nope',
        connectorId: 'c',
        serverUrl: '',
      }),
    ).rejects.toThrow(/No integration registered/);
  });

  it('health reflects the stored connection and granted action count', async () => {
    const canva = makeDeps('canva');
    const engine = new IntegrationEngine(undefined, {
      resolveDeps: (catalogId) => (catalogId === 'canva_ai_designer' ? canva : null),
    });
    await engine.connectOneClick({
      connectionId: 'conn_1',
      catalogId: 'canva_ai_designer',
      displayName: 'AI Designer',
      connectorId: 'canva_connector',
      serverUrl: '',
    });

    const health = await engine.health('conn_1');
    expect(health.status).toBe('connected');
    expect(health.grantedActions).toBe(1);
    expect(health.live).toBe(true);
  });

  it('invokeAction routes to the right integration and reports not-ready', async () => {
    const canva = makeDeps('canva');
    const engine = new IntegrationEngine(undefined, {
      resolveDeps: (catalogId) => (catalogId === 'canva_ai_designer' ? canva : null),
    });
    await engine.connectOneClick({
      connectionId: 'conn_1',
      catalogId: 'canva_ai_designer',
      displayName: 'AI Designer',
      connectorId: 'canva_connector',
      serverUrl: '',
    });

    const ok = await engine.invokeAction({
      connectionId: 'conn_1',
      connectorId: 'canva_connector',
      action: 'create_design_from_prompt',
      input: { prompt: 'hi' },
    });
    expect(ok.ok).toBe(true);
    expect(canva.callTool).toHaveBeenCalledWith('canva_connector', 'create_design_from_prompt', { prompt: 'hi' });

    const missing = await engine.invokeAction({
      connectionId: 'does_not_exist',
      connectorId: 'x',
      action: 'a',
      input: {},
    });
    expect(missing.ok).toBe(false);
  });

  it('keeps legacy single-integration mode working', async () => {
    const legacy = makeDeps('legacy');
    const engine = new IntegrationEngine(legacy);
    const conn = await engine.connectOneClick({
      connectionId: 'legacy_1',
      catalogId: 'anything',
      displayName: 'Legacy',
      connectorId: 'legacy_conn',
      serverUrl: '',
    });
    expect(conn.status).toBe('connected');
    await engine.disconnect('legacy_1');
    expect(legacy.disconnectSpy).toHaveBeenCalledWith('legacy_conn');
  });
});

describe('integrationRegistry', () => {
  beforeEach(() => {
    // registry is module-level singleton; ensure Canva is registered.
    registerBuiltInIntegrations();
  });

  it('registers the built-in Canva integration', () => {
    expect(integrationRegistry.has('canva_ai_designer')).toBe(true);
    const entry = integrationRegistry.get('canva_ai_designer');
    expect(entry?.displayName).toBe('AI Designer');
    expect(entry?.getDeps()).toBeDefined();
  });

  it('lists registered integrations for the catalog', () => {
    const list = integrationRegistry.list();
    expect(list.some((e) => e.catalogId === 'canva_ai_designer')).toBe(true);
  });
});
