import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { connectors } from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import {
  generateAuthUrl,
  isOAuthProvider,
  OAUTH_CONFIGS,
  GUIDED_SETUP_CONTENT,
  getOAuthAppCredentials,
  setOAuthAppCredentials,
} from '../lib/oauthManager';
import { vimoSocialPublish, enrichConnectorAfterOAuth } from '../services/vimoSocialPublishService';
import { getOAuthProviderKey } from '../lib/oauthManager';
import { formatError } from '../lib/errorFormatter';

const registry = new ConnectorRegistry(db);

export default async function socialAccountsRoutes(app: FastifyInstance) {
  app.get('/api/social-accounts/status', async () => {
    const all = await registry.getAll();
    const socialConnectors = all.filter((c) => c.type === 'social' || c.provider === 'vmosocial');
    return {
      isConnected: socialConnectors.length > 0,
      connectionId: socialConnectors[0]?.id || null,
      connectedAt: socialConnectors[0]?.createdAt || null,
      connectorCount: socialConnectors.length,
    };
  });

  app.get('/api/social-accounts/connected', async () => {
    const all = await registry.getAll();
    const platforms = await vimoSocialPublish.getConnectedPlatforms();
    const accounts = await vimoSocialPublish.getAccounts();
    return { platforms, accounts };
  });

  app.get('/api/social-accounts/connect/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };

      const oauthKey = platform === 'instagram' ? 'instagram_facebook' : platform;
      if (!isOAuthProvider(oauthKey) && oauthKey !== 'instagram_facebook') {
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

      const provider = platform === 'instagram' ? 'instagram_facebook' : platform === 'twitter' ? 'x' : platform;

      const connectorId = crypto.randomUUID();

      const connector = await registry.create({
        name: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
        type: 'social',
        provider,
        status: 'inactive',
        config: { tools: [], serverType: 'builtin' },
      });

      const result = await generateAuthUrl(oauthKey, connector.id);
      if ('needsSetup' in result) {
        await registry.delete(connector.id);
        return { needsSetup: true, setupGuide: result.setupGuide, platform };
      }

      return { authUrl: result.authUrl, connectorId: connector.id, platform };
    } catch (err: any) {
      return reply.status(400).send(formatError(err));
    }
  });

  app.post('/api/social-accounts/save-credentials', async (request, reply) => {
    try {
      const body = request.body as {
        provider: string;
        clientId: string;
        clientSecret?: string;
      };

      if (!body.provider || !body.clientId) {
        return reply.status(400).send({ error: 'provider and clientId are required' });
      }

      // Normalize the provider key (e.g. "instagram" -> "instagram_facebook",
      // "twitter" -> "x") so the saved credentials line up with what the
      // OAuth manager reads when building the authorization URL.
      const providerKey = getOAuthProviderKey(body.provider);

      // Merge with existing credentials instead of overwriting
      const existing = await getOAuthAppCredentials();
      const updated = {
        ...existing,
        [providerKey]: {
          clientId: body.clientId,
          clientSecret: body.clientSecret || (existing as any)[providerKey]?.clientSecret || '',
        },
      };

      await setOAuthAppCredentials(updated as any);

      return { success: true, message: 'Credentials saved successfully.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/social-accounts/disconnect/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };
      const body = request.body as { connectorId?: string };

      if (platform === 'all') {
        const all = await registry.getAll();
        const socialConnectors = all.filter((c) => c.type === 'social' || c.provider === 'vmosocial');
        for (const conn of socialConnectors) {
          await registry.delete(conn.id);
        }
        return { success: true, disconnected: socialConnectors.length };
      }

      if (body.connectorId) {
        await registry.delete(body.connectorId);
      } else {
        const all = await registry.getAll();
        const targetConnectors = all.filter((c) => {
          if (platform === 'instagram') {
            return c.provider === 'instagram_facebook' || c.provider === 'instagram';
          }
          if (platform === 'twitter') return c.provider === 'x' || c.provider === 'twitter';
          return c.provider === platform;
        });
        for (const conn of targetConnectors) {
          await registry.delete(conn.id);
        }
      }

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/social-accounts/connect-app-password — connect app-password platforms (e.g. Bluesky)
  app.post('/api/social-accounts/connect-app-password', async (request, reply) => {
    try {
      const body = request.body as {
        provider: string;
        handle?: string;
        appPassword?: string;
        [key: string]: string | undefined;
      };

      if (!body.provider) {
        return reply.status(400).send({ error: 'provider is required' });
      }

      const credentialKeys = Object.keys(body).filter(
        (k) => k !== 'provider' && typeof body[k] === 'string' && body[k],
      );
      if (credentialKeys.length === 0) {
        return reply.status(400).send({ error: 'At least one credential value is required' });
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
          provider: body.provider,
          status: 'active',
          config: { tools: [], serverType: 'builtin' },
        });
        connectorId = connector.id;
      }

      for (const key of credentialKeys) {
        await credentialStore.storeCredential(connectorId, key, body[key] as string);
      }

      await enrichConnectorAfterOAuth(connectorId, body.provider, '');

      return { success: true, connectorId };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/social-accounts/refresh', async () => {
    const accounts = await vimoSocialPublish.getAccounts();
    const platforms = await vimoSocialPublish.getConnectedPlatforms();
    return { accounts, platforms };
  });

  app.get('/api/social-accounts/oauth-status/:connectorId', async (request, reply) => {
    try {
      const { connectorId } = request.params as { connectorId: string };
      const connector = await registry.getById(connectorId);
      if (!connector) {
        return reply.status(404).send({ error: 'Connector not found' });
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
