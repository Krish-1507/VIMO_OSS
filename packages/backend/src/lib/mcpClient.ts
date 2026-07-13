interface Tool {
  name: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: any;
}

// Lazy-load MCP SDK to avoid CJS/ESM interop issues at import time
function getMCPModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@modelcontextprotocol/sdk/client');
  return mod['Client'] ? mod : (mod['default'] || mod);
}

function getSSETransportClass() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@modelcontextprotocol/sdk/client/sse')['SSEClientTransport'];
}

interface IClient {
  connect: (...args: unknown[]) => Promise<unknown>;
  close: () => Promise<unknown>;
  callTool: (...args: unknown[]) => Promise<unknown>;
  listTools: () => Promise<unknown>;
}

export class MCPClient {
  private clients: Map<string, IClient> = new Map();
  // Track which connections are in-process (use InMemoryTransport) vs remote SSE
  private inProcessTransports: Map<string, unknown> = new Map();

  async connectSSE(
    connectorId: string,
    serverUrl: string,
    headers?: Record<string, string>
  ): Promise<void> {
    const MCP = getMCPModule();
    const SSEClientTransport = getSSETransportClass();
    const url = new URL(serverUrl);
    const transport = new SSEClientTransport(url, { requestInit: { headers } });

    const client = new MCP['Client']({ name: 'vimo', version: '1.0.0' });
    await client.connect(transport);

    // List tools to verify connection
    await client.listTools();

    this.clients.set(connectorId, client);
  }

  /**
   * Connect to an in-process MCP server via InMemoryTransport.
   * This avoids needing a separate process or HTTP server.
   */
  async connectInProcess(
    connectorId: string,
    clientTransport: any
  ): Promise<void> {
    const MCP = getMCPModule();
    const Client = MCP['Client'];
    const client = new Client({ name: 'vimo-inproc', version: '1.0.0' });
    await client.connect(clientTransport);
    await client.listTools();
    this.clients.set(connectorId, client);
    this.inProcessTransports.set(connectorId, clientTransport);
  }

  async disconnect(connectorId: string): Promise<void> {
    const client = this.clients.get(connectorId);
    if (client) {
      await client.close();
      this.clients.delete(connectorId);
    }
  }

  async callTool(
    connectorId: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(connectorId);
    if (!client) {
      throw new Error(`Connector ${connectorId} not connected`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: params,
    } as unknown);

    return result;
  }

  async getToolManifest(connectorId: string): Promise<Tool[]> {
    const client = this.clients.get(connectorId);
    if (!client) {
      throw new Error(`Connector ${connectorId} not connected`);
    }

    const toolsResponse = (await client.listTools()) as { tools?: { name: string; description?: string; inputSchema?: unknown }[] } | undefined;
    if (!toolsResponse || !Array.isArray(toolsResponse.tools)) {
      return [];
    }

    return toolsResponse.tools.map((tool: { name: string; description?: string; inputSchema?: unknown }) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  isConnected(connectorId: string): boolean {
    return this.clients.has(connectorId);
  }
}

export const mcpClient = new MCPClient();
