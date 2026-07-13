/**
 * Connection Health Routes
 *
 * Surfaces a single, central view of every connected platform/account along
 * with its real health (circuit-breaker state, last error, follower count)
 * and exposes a one-click "Reconnect" action that self-heals expired tokens.
 *
 * GET  /api/connections/health     — central connection health dashboard
 * POST /api/connections/:platform/reconnect — self-heal a platform connection
 */
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import { getProductionEngine } from '../server/integrations/productionEngine';
import { connectionRegistry } from '../services/externalConnection';
import { vimoSocialPublish } from '../services/vimoSocialPublishService';
import { refreshInstagramToken } from '../services/connectorHealthService';
import { refreshAccessToken, isOAuthProvider } from '../lib/oauthManager';
import { formatError } from '../lib/errorFormatter';

/* Map a public platform key to the connector provider key stored in DB. */
function providerKeyFor(platform: string): string {
  if (platform === 'instagram') return 'instagram_facebook';
  if (platform === 'twitter') return 'x';
  return platform;
}

/* Inverse: which platform key a circuit-breaker connection name maps to. */
const CIRCUIT_TO_PLATFORM: Record<string, string> = {
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
  x: 'x',
  tiktok: 'tiktok',
  youtube: 'youtube',
  pinterest: 'pinterest',
  bluesky: 'bluesky',
};

function healthFromStatus(status: string, connected: boolean): 'good' | 'warning' | 'error' | 'disconnected' {
  if (!connected) return 'disconnected';
  if (status === 'error') return 'error';
  if (status === 'rate_limited') return 'warning';
  return 'good';
}

export default async function connectionsRoutes(app: FastifyInstance) {
  /* ------------------------------------------------------------------ */
  /*  Central connection health dashboard                                */
  /* ------------------------------------------------------------------ */
  app.get('/api/connections/health', async (_request, reply) => {
    try {
      const engine = getProductionEngine();
      const registry = new ConnectorRegistry(db);

      // 1) Real social accounts (with live health + follower counts).
      let accounts: Awaited<ReturnType<typeof vimoSocialPublish.getAccounts>> = [];
      try {
        accounts = await vimoSocialPublish.getAccounts();
      } catch {
        accounts = [];
      }

      // 2) Connector-level state (active/inactive/error) from the engine.
      const states = engine.getAllConnectionStates();

      // 3) Circuit-breaker health from the resilient HTTP connections.
      const circuits = connectionRegistry.getAllHealth();

      const map = new Map<string, any>();

      for (const acc of accounts) {
        const connected = acc.isConnected;
        map.set(acc.platform, {
          platform: acc.platform,
          name: acc.name,
          connected,
          followers: typeof acc.followerCount === 'number' ? acc.followerCount : 0,
          health: connected ? acc.health || 'good' : 'error',
          reason: connected ? null : (acc.healthMessage || 'Not connected'),
          lastError: connected ? null : (acc.healthMessage || null),
          providerKey: providerKeyFor(acc.platform),
        });
      }

      // Merge connector states.
      for (const s of states) {
        const entry =
          map.get(s.provider) ||
          {
            platform: s.provider,
            name: s.provider,
            connected: s.status === 'connected',
            followers: 0,
            health: healthFromStatus(s.status, s.status === 'connected'),
            reason: null,
            lastError: null,
            providerKey: s.provider,
          };
        entry.connectorStatus = s.status;
        entry.healthScore = s.healthScore;
        if (s.lastErrorMessage) {
          entry.lastError = s.lastErrorMessage;
          entry.reason = s.lastErrorMessage;
          entry.health = 'error';
        } else if (s.status === 'connected' && entry.health !== 'error') {
          entry.health = 'good';
        } else if (s.status !== 'connected') {
          entry.health = healthFromStatus(s.status, false);
        }
        map.set(entry.platform, entry);
      }

      // Merge circuit-breaker telemetry.
      for (const [name, h] of Object.entries(circuits)) {
        const platform = CIRCUIT_TO_PLATFORM[name] || name;
        const entry = map.get(platform);
        if (entry) {
          entry.circuitState = h.circuitState;
          entry.consecutiveFailures = h.consecutiveFailures;
          entry.avgLatencyMs = h.averageLatency;
          entry.lastSuccess = h.lastSuccess;
          if (h.circuitState === 'open') {
            entry.health = 'error';
            entry.reason = entry.reason || 'Connection repeatedly failing (circuit breaker open).';
          }
        }
      }

      const connections = Array.from(map.values()).map((c) => ({
        platform: c.platform,
        name: c.name,
        connected: c.connected,
        followers: c.followers,
        health: c.health,
        reason: c.reason || null,
        lastError: c.lastError || null,
        connectorStatus: c.connectorStatus || (c.connected ? 'connected' : 'disconnected'),
        healthScore: typeof c.healthScore === 'number' ? c.healthScore : (c.connected ? 100 : 0),
        circuitState: c.circuitState || 'closed',
        consecutiveFailures: c.consecutiveFailures || 0,
        avgLatencyMs: c.avgLatencyMs || 0,
        canReconnect: c.connected === false || c.health === 'error' || c.health === 'warning',
      }));

      const hasError = connections.some((c) => c.health === 'error');
      const hasWarning = connections.some((c) => c.health === 'warning');
      const overall: 'healthy' | 'degraded' | 'unhealthy' =
        hasError ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

      return {
        overall,
        connectionCount: connections.length,
        connectedCount: connections.filter((c) => c.connected).length,
        connections,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  /* ------------------------------------------------------------------ */
  /*  One-click reconnect (self-healing for expired tokens)              */
  /* ------------------------------------------------------------------ */
  app.post('/api/connections/:platform/reconnect', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };
      const engine = getProductionEngine();
      const registry = new ConnectorRegistry(db);
      const allConnectors = await registry.getAll();
      const providerKey = providerKeyFor(platform);
      const connector = allConnectors.find(
        (c) => c.provider === providerKey && (c.type === 'social' || c.provider === 'vmosocial')
      );

      if (!connector) {
        return reply.status(404).send({
          error: `No connected account found for ${platform}. Connect it first in Social Accounts.`,
        });
      }

      let refreshed = false;
      let message = '';
      let details = '';

      if (providerKey === 'instagram_facebook') {
        try {
          refreshed = await refreshInstagramToken(connector.id);
          details = refreshed
            ? 'Instagram token refreshed via Facebook Graph API.'
            : 'Could not refresh the Instagram token automatically.';
        } catch (e: any) {
          details = `Instagram token refresh failed: ${e?.message || 'unknown error'}`;
        }
      } else if (isOAuthProvider(providerKey)) {
        const refreshToken = await credentialStore.getCredential(connector.id, 'refreshToken');
        if (refreshToken) {
          try {
            const res = await refreshAccessToken(providerKey, refreshToken);
            await credentialStore.storeCredential(connector.id, 'accessToken', res.accessToken);
            if (res.expiresIn) {
              await credentialStore.storeCredential(
                connector.id,
                'tokenExpiresAt',
                String(Date.now() + res.expiresIn * 1000)
              );
            }
            refreshed = true;
            details = `${platform} token refreshed successfully.`;
          } catch (e: any) {
            details = `Token refresh failed: ${e?.message || 'unknown error'}`;
          }
        } else {
          details = 'No refresh token stored — you will need to reconnect manually via Social Accounts.';
        }
      } else {
        details = `${platform} does not support automatic token refresh. Reconnect it in Social Accounts.`;
      }

      // Re-test the connection so the UI reflects the new state immediately.
      let testOk = false;
      try {
        const test = await engine.testConnection(providerKey);
        testOk = test.success;
        if (!message) message = test.message;
      } catch {
        testOk = false;
      }

      const success = refreshed && testOk;
      return {
        success,
        platform,
        message: message || details,
        details,
        healthy: testOk,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
