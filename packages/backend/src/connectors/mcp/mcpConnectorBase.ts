/**
 * MCP Connector Base — Base class for all MCP (Model Context Protocol)
 * connectors that serve as intelligence context sources.
 *
 * MCP connectors are DIFFERENT from native social connectors:
 * - Native connectors: publish content, schedule posts, monitor engagement
 * - MCP connectors: feed context to VIMO's AI about what's happening in the business
 *
 * Each MCP connector defines workflows — automated content generation
 * pipelines triggered by specific events.
 */

export interface MCPWorkflow {
  name: string;
  description: string;
  trigger: string;
  output: string;
}

export interface MCPConnectorConfig {
  serverUrl?: string;
  npmPackage?: string;
  enabled: boolean;
  lastSyncAt?: string;
}

export interface MCPToolManifest {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Base class for MCP intelligence connectors.
 * Subclasses implement harvestContext() to pull data from their respective sources.
 */
export abstract class MCPConnectorBase {
  public readonly provider: string;
  public readonly name: string;
  public readonly workflows: MCPWorkflow[];
  protected config: MCPConnectorConfig;

  constructor(provider: string, name: string, workflows: MCPWorkflow[], config: MCPConnectorConfig = { enabled: false }) {
    this.provider = provider;
    this.name = name;
    this.workflows = workflows;
    this.config = config;
  }

  /**
   * Harvest context from this MCP source for the past N days.
   * Returns a human-readable summary of what happened.
   */
  abstract harvestContext(days: number): Promise<{ summary: string; rawData: string }>;

  /**
   * Get the available tools for this MCP connector.
   */
  abstract getTools(): Promise<MCPToolManifest[]>;

  /**
   * Call a tool on this MCP connector.
   */
  abstract callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}
