type ConnectStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ToolManifestEntry = { name: string; description?: string; inputSchema?: unknown };

/**
 * Dependencies an integration needs to actually talk to its backing service.
 * The Integration Engine is agnostic about *which* integration it drives — it
 * just calls these. Each integration registers its own deps via the
 * IntegrationRegistry (see ./registry.ts).
 */
export interface IntegrationEngineDeps {
  // Under the hood we can keep using the existing MCP client for now.
  // Later we'll split transports (stdio vs SSE/HTTP) and health monitoring.
  callTool: (connectorId: string, toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  connect: (connectorId: string, serverUrl: string) => Promise<void>;
  disconnect: (connectorId: string) => Promise<void>;
  listTools: (connectorId: string) => Promise<ToolManifestEntry[]>;
  isConnected: (connectorId: string) => boolean;
}

export interface IntegrationConnection {
  connectionId: string;
  catalogId: string;
  displayName: string;
  status: ConnectStatus;
  accountHandle?: string;
  grantedActions: string[];
  lastError?: string;
  updatedAt: string;
}

export interface IntegrationEngineOptions {
  /**
   * Resolves the deps for a given integration (catalogId + connectorId). The
   * production wiring passes a resolver backed by `integrationRegistry`, so the
   * engine never has to know about Canva (or any other integration) directly.
   * If omitted, the engine falls back to the single `deps` passed to its
   * constructor (legacy single-integration mode).
   */
  resolveDeps?: (catalogId: string, connectorId: string) => IntegrationEngineDeps | null;
}

export class IntegrationEngine {
  /**
   * @param deps   Optional legacy single-integration deps. When provided and no
   *               `resolveDeps` returns a match, these are used so existing
   *               callers keep working.
   * @param opts   Registry wiring so the engine can host *many* integrations.
   */
  constructor(
    private deps?: IntegrationEngineDeps,
    private opts: IntegrationEngineOptions = {},
  ) {}

  private connections = new Map<string, IntegrationConnection>();

  // Per-connection deps + connectorId so disconnect/health/invoke always know
  // which integration (and which connector) a connection belongs to.
  private connectionDeps = new Map<string, IntegrationEngineDeps>();
  private connectorIds = new Map<string, string>();

  getConnection(connectionId: string): IntegrationConnection | null {
    return this.connections.get(connectionId) ?? null;
  }

  listConnections(): IntegrationConnection[] {
    return Array.from(this.connections.values());
  }

  private resolveDeps(catalogId: string, connectorId: string): IntegrationEngineDeps {
    const fromResolver = this.opts.resolveDeps?.(catalogId, connectorId);
    if (fromResolver) return fromResolver;
    if (this.deps) return this.deps;
    throw new Error(`No integration registered for catalogId "${catalogId}".`);
  }

  async connectOneClick(params: {
    connectionId: string;
    catalogId: string;
    displayName: string;
    connectorId: string;
    serverUrl: string;
  }): Promise<IntegrationConnection> {
    const { connectionId, catalogId, displayName, connectorId, serverUrl } = params;

    const deps = this.resolveDeps(catalogId, connectorId);

    const now = new Date().toISOString();
    const existing: IntegrationConnection =
      this.connections.get(connectionId) ?? ({
        connectionId,
        catalogId,
        displayName,
        status: 'disconnected',
        grantedActions: [],
        updatedAt: now,
      } as IntegrationConnection);

    this.connections.set(connectionId, { ...existing, status: 'connecting', updatedAt: now });

    try {
      await deps.connect(connectorId, serverUrl);

      const tools = await deps.listTools(connectorId);
      const grantedActions = tools.map((t) => t.name);

      const updated: IntegrationConnection = {
        connectionId,
        catalogId,
        displayName,
        status: 'connected',
        grantedActions,
        updatedAt: new Date().toISOString(),
      };

      // Persist the connection → integration mapping so disconnect/health work.
      this.connections.set(connectionId, updated);
      this.connectionDeps.set(connectionId, deps);
      this.connectorIds.set(connectionId, connectorId);
      return updated;
    } catch (err) {
      const updated: IntegrationConnection = {
        ...existing,
        status: 'error',
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      };
      this.connections.set(connectionId, updated);
      throw err;
    }
  }

  /**
   * Disconnect a connection. Because we persisted the connectionId →
   * connectorId (and its deps) during connectOneClick, this now calls the real
   * underlying integration's disconnect instead of being best-effort.
   */
  async disconnect(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const deps = this.connectionDeps.get(connectionId);
    const connectorId = this.connectorIds.get(connectionId);

    if (deps && connectorId) {
      try {
        await deps.disconnect(connectorId);
      } catch (err) {
        // Surface the failure on the connection but don't blow up the request.
        this.connections.set(connectionId, {
          ...conn,
          status: 'error',
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        });
        return;
      }
    }

    this.connections.set(connectionId, {
      ...conn,
      status: 'disconnected',
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Health of a single connection: its status, last error, and how many tools
   * are granted. Resolves the correct integration deps per connection.
   */
  async health(connectionId: string): Promise<{
    status: ConnectStatus;
    lastError?: string;
    grantedActions: number;
    live?: boolean;
  }> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return { status: 'disconnected', grantedActions: 0 };
    }
    const deps =
      this.connectionDeps.get(connectionId) ??
      this.resolveDepsSafe(conn.catalogId, this.connectorIds.get(connectionId) || '');
    return {
      status: conn.status,
      lastError: conn.lastError,
      grantedActions: conn.grantedActions.length,
      ...(deps && conn.status === 'connected' ? { live: deps.isConnected(this.connectorIds.get(connectionId) || '') } : {}),
    };
  }

  private resolveDepsSafe(catalogId: string, connectorId: string): IntegrationEngineDeps | null {
    try {
      return this.resolveDeps(catalogId, connectorId);
    } catch {
      return null;
    }
  }

  async invokeAction(params: {
    connectionId: string;
    connectorId: string;
    action: string;
    input: Record<string, unknown>;
  }): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const { connectionId, connectorId, action, input } = params;
    const conn = this.connections.get(connectionId);
    if (!conn || conn.status !== 'connected') {
      return { ok: false, error: 'Connection not ready. Please reconnect.' };
    }

    const deps =
      this.connectionDeps.get(connectionId) ??
      this.resolveDepsSafe(conn.catalogId, connectorId);
    if (!deps) {
      return { ok: false, error: 'Integration deps unavailable. Please reconnect.' };
    }

    try {
      const result = await deps.callTool(connectorId, action, input);
      return { ok: true, data: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.connections.set(connectionId, { ...conn, lastError: msg, status: 'error', updatedAt: new Date().toISOString() });
      return { ok: false, error: msg };
    }
  }
}
