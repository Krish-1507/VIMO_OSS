/**
 * Built-in MCP Server — wraps platform handlers as MCP tools using
 * the @modelcontextprotocol/sdk Server + InMemoryTransport.
 *
 * Each connector gets its own MCP server instance keyed by connector.id
 * so that tool handlers can look up credentials under the correct DB ID.
 */

import { callPlatformHandler, handlerRegistry } from './platform-handlers';
import type { PresetConnector } from '../connectors/presets';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Server } = require('@modelcontextprotocol/sdk/server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

interface McpServerInstance {
  server: any;
  clientTransport: any;
  provider: string;
}

const instances = new Map<string, McpServerInstance>();

/**
 * Create an in-process MCP server for a specific connector.
 * The server is keyed by connectorId so tool calls can look up
 * credentials using the real DB connector UUID.
 */
export async function createConnectorServer(
  connectorId: string,
  preset: PresetConnector
): Promise<McpServerInstance> {
  // Close existing instance for this connector if any
  const existing = instances.get(connectorId);
  if (existing) {
    try { await existing.server.close(); } catch { /* ignore */ }
    instances.delete(connectorId);
  }

  const server = new Server(
    { name: `vimo-connector-${connectorId.slice(0, 8)}`, version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register tools from the preset
  server.setRequestHandler('tools/list', async () => ({
    tools: preset.tools.map((t: { name: string; description: string }) => ({
      name: t.name,
      description: t.description,
      inputSchema: { type: 'object' as const, properties: {} },
    })),
  }));

  // Handle tool calls — use connectorId for credential lookup
  server.setRequestHandler('tools/call', async (request: any) => {
    const toolName = request.params.name;
    const input = request.params.arguments || {};

    try {
      const result = await callPlatformHandler(preset.provider, toolName, connectorId, input);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  // Create linked in-memory transport pair
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const instance: McpServerInstance = { server, clientTransport, provider: preset.provider };
  instances.set(connectorId, instance);
  return instance;
}

/**
 * Close a specific connector's MCP server.
 */
export async function closeConnectorServer(connectorId: string): Promise<void> {
  const instance = instances.get(connectorId);
  if (instance) {
    try { await instance.server.close(); } catch { /* ignore */ }
    instances.delete(connectorId);
  }
}

/**
 * Close all MCP server instances (for cleanup on shutdown).
 */
export async function closeAllServers(): Promise<void> {
  for (const [id] of instances) {
    await closeConnectorServer(id);
  }
}

/**
 * Check if a server exists for a given connector.
 */
export function hasServer(connectorId: string): boolean {
  return instances.has(connectorId);
}

/**
 * Validate that a preset has handlers for all its declared tools.
 */
export function validateHandlers(preset: PresetConnector): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const tool of preset.tools) {
    const key = `${preset.provider}_${tool.name}`;
    if (!(key in handlerRegistry)) {
      // Only flag as missing if no handler exists at all for this tool
      if (!(tool.name in handlerRegistry)) {
        missing.push(tool.name);
      }
    }
  }
  return { valid: missing.length === 0, missing };
}
