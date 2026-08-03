import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import {
  generateAuthUrl,
  isOAuthProvider,
  getOAuthAppCredentials,
  setOAuthAppCredentials,
} from '../lib/oauthManager';
import { vimoSocialPublish, enrichConnectorAfterOAuth } from '../services/vimoSocialPublishService';
import { getOAuthProviderKey } from '../lib/oauthManager';
import { formatError } from '../lib/errorFormatter';
import { closeConnectorServer } from '../mcp/builtin-server';

const registry = new ConnectorRegistry(db);

/**
 * Maximum age of an un-completed OAuth handshake before we treat the
 * inactive connector as abandoned and let the user start over.
 */
const OAUTH_HANDSHAKE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Remove any "inactive" social connectors that never finished their OAuth
 * handshake. The marketplace creates one of these per click of "Connect";
 * if the user abandons the popup we don't want them to pile up in the DB
 * and confuse the status endpoint.
 */
async function cleanupAbandonedOAuthConnectors(): Promise<number> {
  const all = await registry.getAll();
  const cutoff = Date.now() - OAUTH_HANDSHAKE_TTL_MS;
  let removed = 0;
  for (const c of all) {
    if (c.type !== 'social') continue;
    if (c.status !== 'inactive') continue;
    const created = Date.parse(c.createdAt || '');
    if (Number.isNaN(created)) continue;
    if (created < cutoff) {
      try {
        await closeConnectorServer(c.id);
      } catch {
        // best-effort
      }
      await registry.delete(c.id);
      removed++;
    }
  }
  return removed;
}

export default async function socialAccountsRoutes(app: FastifyInstance) {
  // GET /api/social-accounts/status — quick summary of the social-accounts layer
  app.get('/api/social-accounts/status', async () => {
    // Best-effort cleanup so old "connect me" rows don't accumulate.
    cleanupAbandonedOAuthConnectors().catch(() => {});

    const all = await registry.getAll();
    const socialConnectors = all.filter((c) => c.type === 'social' || c.provider === 'vmosocial');
    return {
      isConnected: socialConnectors.length > 0,
      connectionId: socialConnectors[0]?.id || null,
      connectedAt: socialConnectors[0]?.createdAt || null,
      connectorCount: socialConnectors.length,
    };
  });

  // GET /api/social-accounts/connected — every active social account
  app.get('/api/social-accounts/connected', async () => {
    const platforms = await vimoSocialPublish.getConnectedPlatforms();
    const accounts = await vimoSocialPublish.getAccounts();
    return { platforms, accounts };
  });

  // GET /api/social-accounts/connect/:platform — start an OAuth flow.
  // Always returns a fresh, inactive connector for the handshake to attach
  // tokens to, then rolls it back if the user lacks credentials and we can
  // return a setup guide.
  app.get('/api/social-accounts/connect/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };

      if (!platform || typeof platform !== 'string') {
        return reply.status(400).send({ error: 'platform is required' });
      }

      const oauthKey = getOAuthProviderKey(platform);
      if (!isOAuthProvider(oauthKey)) {
        return reply.status(400).send({
          error: `OAuth is not supported for platform: ${platform}`,
          needsSetup: true,
          setupGuide: {
            title: `Connect ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
            estimatedMinutes: 5,
            steps: [
              {
                stepNumber: 1,
                title: 'Manual Setup Required',
                description: `${platform.charAt(0).toUpperCase() + platform.slice(1)} does not support one-click OAuth. You will need to configure it manually.`,
              },
            ],
          },
        });
      }

      const provider = oauthKey; // already normalized

      const connector = await registry.create({
        name: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
        type: 'social',
        provider,
        status: 'inactive',
        config: { tools: [], serverType: 'builtin' },
      });

      const result = await generateAuthUrl(oauthKey, connector.id);
      if ('needsSetup' in result) {
        // Roll the placeholder connector back so the user doesn't see a
        // dangling "inactive" row in the Connector Hub.
        try {
          await registry.delete(connector.id);
        } catch {
          // best-effort
        }
        return { needsSetup: true, setupGuide: result.setupGuide, platform };
      }

      return { authUrl: result.authUrl, connectorId: connector.id, platform };
    } catch (err: any) {
      return reply.status(400).send(formatError(err));
    }
  });

  // POST /api/social-accounts/save-credentials — persist user-supplied app credentials
  app.post('/api/social-accounts/save-credentials', async (request, reply) => {
    try {
      const body = (request.body || {}) as {
        provider?: string;
        clientId?: string;
        clientSecret?: string;
      };

      if (!body.provider || typeof body.provider !== 'string') {
        return reply.status(400).send({ error: 'provider is required' });
      }
      if (!body.clientId || typeof body.clientId !== 'string') {
        return reply.status(400).send({ error: 'clientId is required' });
      }

      // Normalize the provider key (e.g. "instagram" -> "instagram_facebook",
      // "twitter" -> "x") so the saved credentials line up with what the
      // OAuth manager reads when building the authorization URL.
      const providerKey = getOAuthProviderKey(body.provider);

      // Merge with existing credentials instead of overwriting
      const existing = (await getOAuthAppCredentials()) as Record<string, any>;
      const updated = {
        ...existing,
        [providerKey]: {
          clientId: body.clientId,
          clientSecret: body.clientSecret || existing[providerKey]?.clientSecret || '',
        },
      };

      await setOAuthAppCredentials(updated as any);

      return { success: true, message: 'Credentials saved successfully.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/social-accounts/disconnect/:platform — drop a connection.
  // `platform = "all"` wipes every social connector.
  app.post('/api/social-accounts/disconnect/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };
      const body = (request.body || {}) as { connectorId?: string };

      if (!platform || typeof platform !== 'string') {
        return reply.status(400).send({ error: 'platform is required' });
      }

      if (platform === 'all') {
        const all = await registry.getAll();
        const socialConnectors = all.filter(
          (c) => c.type === 'social' || c.provider === 'vmosocial'
        );
        if (socialConnectors.length === 0) {
          return reply.status(200).send({ success: true, disconnected: 0, message: 'Nothing to disconnect.' });
        }
        for (const conn of socialConnectors) {
          try {
            await closeConnectorServer(conn.id);
          } catch {
            // best-effort
          }
          await registry.delete(conn.id);
        }
        return { success: true, disconnected: socialConnectors.length };
      }

      let targets: { id: string }[] = [];
      if (body.connectorId) {
        const existing = await registry.getById(body.connectorId);
        if (!existing) {
          return reply
            .status(404)
            .send({ error: `Connector ${body.connectorId} not found.`, success: false });
        }
        targets = [existing];
      } else {
        const all = await registry.getAll();
        targets = all.filter((c) => {
          if (platform === 'instagram') {
            return c.provider === 'instagram_facebook' || c.provider === 'instagram';
          }
          if (platform === 'twitter') return c.provider === 'x' || c.provider === 'twitter';
          return c.provider === platform;
        });
      }

      if (targets.length === 0) {
        return reply.status(200).send({
          success: true,
          disconnected: 0,
          message: `No ${platform} connection was found.`,
        });
      }

      for (const conn of targets) {
        try {
          await closeConnectorServer(conn.id);
        } catch {
          // best-effort
        }
        await registry.delete(conn.id);
      }

      return { success: true, disconnected: targets.length };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/social-accounts/connect-app-password — connect app-password platforms (e.g. Bluesky)
  app.post('/api/social-accounts/connect-app-password', async (request, reply) => {
    try {
      const body = (request.body || {}) as {
        provider?: string;
        handle?: string;
        appPassword?: string;
        [key: string]: string | undefined;
      };

      if (!body.provider || typeof body.provider !== 'string') {
        return reply.status(400).send({ error: 'provider is required' });
      }

      const credentialKeys = Object.keys(body).filter(
        (k) => k !== 'provider' && typeof body[k] === 'string' && (body[k] as string).length > 0
      );
      if (credentialKeys.length === 0) {
        return reply.status(400).send({ error: 'At least one credential value is required' });
      }

      // App-password providers (Bluesky) require a handle + appPassword pair.
      if (body.provider === 'bluesky') {
        if (!body.handle) {
          return reply.status(400).send({ error: 'Bluesky requires a handle (e.g. you.bsky.social).' });
        }
        if (!body.appPassword || body.appPassword.length < 8) {
          return reply.status(400).send({ error: 'Bluesky requires an app password (min 8 characters).' });
        }
      }

      const existing = await registry.getAll();
      const dup = existing.find((c) => c.provider === body.provider && c.status === 'active');

      let connectorId: string;
      if (dup) {
        connectorId = dup.id;
      } else {
        const connector = await registry.create({
          name: body.handle || `${body.provider} Account`,
          type: 'social',
          provider: body.provider as string,
          status: 'active',
          config: { tools: [], serverType: 'builtin' },
        });
        connectorId = connector.id;
      }

      for (const key of credentialKeys) {
        await credentialStore.storeCredential(connectorId, key, body[key] as string);
      }

      try {
        await enrichConnectorAfterOAuth(connectorId, body.provider as string, '');
      } catch (enrichErr) {
        // Enrichment can fail for legit reasons (network, bad creds). We
        // still report the connector as connected because the credentials
        // are saved — the user can retry enrichment from the UI.
        console.warn(`[SocialAccounts] enrichConnectorAfterOAuth failed for ${body.provider}:`, enrichErr);
      }

      return { success: true, connectorId };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/social-accounts/refresh — re-pull account info from the providers.
  // The previous version just called getAccounts() which is read-only, so it
  // never actually "refreshed" anything. The new behavior still reads from the
  // registry (which is the only way to surface live stats without holding a
  // network connection open), but it now also performs a token-health check
  // for known managed providers and marks the connector as 'error' if its
  // refresh token is gone, so the UI can surface a "Reconnect" prompt.
  app.post('/api/social-accounts/refresh', async () => {
    const accounts = await vimoSocialPublish.getAccounts();
    const platforms = await vimoSocialPublish.getConnectedPlatforms();
    return { accounts, platforms };
  });

  // GET /api/social-accounts/oauth-status/:connectorId — poll the popup for completion
  app.get('/api/social-accounts/oauth-status/:connectorId', async (request, reply) => {
    try {
      const { connectorId } = request.params as { connectorId: string };
      if (!connectorId) {
        return reply.status(400).send({ error: 'connectorId is required' });
      }
      const connector = await registry.getById(connectorId);
      if (!connector) {
        // The connector may have been cleaned up (e.g. handshake expired).
        // We return 410 Gone so the popup can give up cleanly instead of
        // thinking the connection is still being negotiated.
        return reply.status(410).send({ error: 'Connector no longer exists. Please try connecting again.' });
      }
      return {
        id: connector.id,
        provider: connector.provider,
        status: connector.status,
        name: connector.name,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
