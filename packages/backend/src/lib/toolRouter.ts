import type { ConnectorRegistry } from './connectorRegistry';
import type { MCPClient } from './mcpClient';
import * as credentialStore from './credentialStore';
import { db } from '../db';
import { agentLogs } from '../db/schema';

interface AgentContext {
  brandProfileId?: string;
}

interface ToolInfo {
  toolName: string;
  description: string;
  connectorId: string;
  connectorName: string;
}

const TOOL_WHITELIST = [
  'llm_complete',
  'llm_embed',
  'post_image',
  'post_text',
  'post_reel',
  'post_story',
  'post_tweet',
  'post_thread',
  'reply_tweet',
  'reply_comment',
  'get_comments',
  'get_insights',
  'get_analytics',
  'get_sessions',
  'create_page',
  'send_message',
  'upload_video',
];

class ToolRouter {
  constructor(
    private connectorRegistry: ConnectorRegistry,
    private mcpClient: MCPClient,
    private credentialStore: typeof import('./credentialStore')
  ) {}

  async routeCall(
    toolName: string,
    params: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<unknown> {
    const allConnectors = await this.connectorRegistry.getAll();
    const activeConnectors = allConnectors.filter((c) => c.status === 'active');

    if (!TOOL_WHITELIST.includes(toolName)) {
      throw new Error(`Tool ${toolName} is not in the approved tool whitelist.`);
    }

    let matchedConnector: (typeof activeConnectors)[number] | undefined;
    let matchedTool: { name: string; description: string } | undefined;

    for (const connector of activeConnectors) {
      const config = await this.connectorRegistry.getConfig(connector.id);
      const tools = (config.tools as { name: string; description: string }[]) || [];
      const tool = tools.find((t) => t.name === toolName);
      if (tool) {
        matchedConnector = connector;
        matchedTool = tool;
        break;
      }
    }

    if (!matchedConnector || !matchedTool) {
      throw new Error(`Tool ${toolName} not found in any active connector`);
    }

    // Get credentials (generic, not logged)
    const credentials = await this.credentialStore.getCredential(matchedConnector.id, 'credentials');
    let parsedCredentials: Record<string, string> = {};
    if (credentials) {
      try {
        parsedCredentials = JSON.parse(credentials);
      } catch {
        // ignore parse error
      }
    }

    const startTime = Date.now();
    let result: unknown;
    let error: Error | undefined;

    try {
      const config = await this.connectorRegistry.getConfig(matchedConnector.id);
      const serverUrl = config.serverUrl as string | undefined;

      if (serverUrl) {
        // Remote MCP server
        result = await this.mcpClient.callTool(matchedConnector.id, toolName, params);
      } else {
        // Built-in handler - dispatch to appropriate handler
        // For now, throw as built-in handlers are not yet implemented
        throw new Error(
          `Built-in handler for ${toolName} on ${matchedConnector.provider} is not yet implemented`
        );
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        agentType: 'tool_router',
        action: toolName,
        input: JSON.stringify(params),
        output: error ? error.message : JSON.stringify(result),
        connectorsCalled: matchedConnector.id,
        status: error ? 'failed' : 'success',
        durationMs: duration,
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }

  async getAvailableTools(): Promise<ToolInfo[]> {
    const allConnectors = await this.connectorRegistry.getAll();
    const activeConnectors = allConnectors.filter((c) => c.status === 'active');

    const tools: ToolInfo[] = [];
    for (const connector of activeConnectors) {
      const config = await this.connectorRegistry.getConfig(connector.id);
      const connectorTools = (config.tools as { name: string; description: string }[]) || [];
      for (const tool of connectorTools) {
        tools.push({
          toolName: tool.name,
          description: tool.description,
          connectorId: connector.id,
          connectorName: connector.name,
        });
      }
    }

    return tools;
  }
}

export const toolRouter = new ToolRouter(
  {} as ConnectorRegistry,
  {} as MCPClient,
  credentialStore
);
