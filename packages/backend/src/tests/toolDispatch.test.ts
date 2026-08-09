/**
 * Tool router built-in dispatch — active connectors route tool calls through
 * the platform handler registry instead of throwing "not yet implemented".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('../mcp/platform-handlers', () => ({
  callPlatformHandler: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

import { callPlatformHandler } from '../mcp/platform-handlers';
import { ToolRouter } from '../lib/toolRouter';
import { db } from '../db';
import { agentLogs } from '../db/schema';

function fakeRegistry(connectors: any[]) {
  return {
    getAll: vi.fn(async () => connectors),
    getConfig: vi.fn(async (id: string) => connectors.find((c) => c.id === id)?.config || {}),
  } as any;
}

const fakeMcpClient = {
  callTool: vi.fn(async () => ({ mcp: true })),
} as any;

const fakeCredentialStore = {
  getCredential: vi.fn(async () => null),
} as any;

function makeRouter(connectors: any[]): ToolRouter {
  return new ToolRouter(fakeRegistry(connectors), fakeMcpClient, fakeCredentialStore);
}

const activeXConnector = () => ({
  id: 'conn_x_1',
  provider: 'x',
  status: 'active',
  config: { serverType: 'builtin', tools: [{ name: 'post_tweet', description: 'Post a tweet' }] },
});

beforeEach(() => {
  db.delete(agentLogs).run();
  vi.mocked(callPlatformHandler).mockClear();
});

describe('built-in dispatch (no serverUrl)', () => {
  it('routes a whitelisted tool through callPlatformHandler', async () => {
    const router = makeRouter([activeXConnector()]);

    const result = await router.routeCall('post_tweet', { text: 'Hello' }, {});

    expect(callPlatformHandler).toHaveBeenCalledTimes(1);
    expect(callPlatformHandler).toHaveBeenCalledWith('x', 'post_tweet', 'conn_x_1', { text: 'Hello' });
    expect(result).toEqual({ ok: true });
  });

  it('dispatches generic tools like llm_embed to the handler registry', async () => {
    const connectors = [
      activeXConnector(),
      {
        id: 'conn_llm_1',
        provider: 'openai',
        status: 'active',
        config: { serverType: 'builtin', tools: [{ name: 'llm_embed', description: 'Embed text' }] },
      },
    ];
    const router = makeRouter(connectors);

    await router.routeCall('llm_embed', { text: 'hi' }, {});

    expect(callPlatformHandler).toHaveBeenCalledWith('openai', 'llm_embed', 'conn_llm_1', { text: 'hi' });
  });

  it('records the dispatch in the agent log', async () => {
    const router = makeRouter([activeXConnector()]);

    await router.routeCall('post_tweet', { text: 'Logged' }, {});

    const logs = db.select().from(agentLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].agentType).toBe('tool_router');
    expect(logs[0].action).toBe('post_tweet');
    expect(logs[0].status).toBe('success');
  });

  it('still rejects tools outside the whitelist', async () => {
    const router = makeRouter([activeXConnector()]);

    await expect(router.routeCall('rm_rf', {}, {})).rejects.toThrow('not in the approved tool whitelist');
    expect(callPlatformHandler).not.toHaveBeenCalled();
  });

  it('errors helpfully when no active connector exposes the tool', async () => {
    const router = makeRouter([activeXConnector()]);

    await expect(router.routeCall('post_story', {}, {})).rejects.toThrow(
      'Tool post_story not found in any active connector'
    );
    expect(callPlatformHandler).not.toHaveBeenCalled();
  });
});

describe('remote MCP path', () => {
  it('keeps using the MCP client when a serverUrl is configured', async () => {
    const remoteConnector = {
      id: 'conn_remote_1',
      provider: 'custom',
      status: 'active',
      config: {
        serverUrl: 'https://mcp.example.com',
        tools: [{ name: 'send_message', description: 'Send a message' }],
      },
    };
    const router = makeRouter([remoteConnector]);

    const result = await router.routeCall('send_message', { to: 'u1' }, {});

    expect(fakeMcpClient.callTool).toHaveBeenCalledWith('conn_remote_1', 'send_message', { to: 'u1' });
    expect(result).toEqual({ mcp: true });
    expect(callPlatformHandler).not.toHaveBeenCalled();
  });
});
