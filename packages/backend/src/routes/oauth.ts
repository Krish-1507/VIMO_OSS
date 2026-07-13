/**
 * OAuth Routes — One-click OAuth2 connector integration
 *
 * GET  /api/auth/oauth/start    — returns authUrl for a provider
 * GET  /api/auth/oauth/callback — redirect URI that exchanges code for tokens
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  verifyOAuthState,
  isOAuthProvider,
  isProviderConnectable,
  OAUTH_CONFIGS,
} from '../lib/oauthManager';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { enrichConnectorAfterOAuth } from '../services/vimoSocialPublishService';

const registry = new ConnectorRegistry(db);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns an HTML page that posts a message to the parent window and closes.
 */
function oauthResponseHtml(
  success: boolean,
  connectorId: string,
  errorMessage?: string,
): string {
  const message = success
    ? JSON.stringify({ success: true, connectorId })
    : JSON.stringify({ success: false, error: errorMessage || 'OAuth failed' });

  return `<!DOCTYPE html>
<html>
<head>
  <title>VIMO OAuth</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
    .container { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #14b8a6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 18px; margin: 0 0 4px; }
    p { font-size: 14px; color: #64748b; margin: 0; }
    .success { color: #059669; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2 class="${success ? 'success' : 'error'}">${success ? 'Connected to VIMO!' : 'Connection Failed'}</h2>
    <p>${success ? 'You can close this window and return to VIMO.' : errorMessage || 'Please try again.'}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(${message}, '*');
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export default async function oauthRoutes(app: FastifyInstance) {
  // GET /api/auth/oauth/start — returns the authorization URL
  app.get('/api/auth/oauth/start', async (request, reply) => {
    try {
      const { provider, connectorId } = request.query as {
        provider: string;
        connectorId: string;
      };

      if (!provider || !connectorId) {
        return reply.status(400).send({
          error: 'provider and connectorId query parameters are required',
        });
      }

      if (!isOAuthProvider(provider)) {
        return reply.status(400).send({
          error: `OAuth is not supported for provider: ${provider}`,
        });
      }

      const result = await generateAuthUrl(provider, connectorId);

      if ('needsSetup' in result) {
        return { needsSetup: true, setupGuide: result.setupGuide };
      }

      return { authUrl: result.authUrl };
    } catch (err: any) {
      return reply.status(400).send(formatError(err));
    }
  });

  // GET /api/auth/oauth/providers — which OAuth providers are one-click ready
  // (VIMO already holds the app credentials, so the user only approves).
  app.get('/api/auth/oauth/providers', async (request, reply) => {
    try {
      const providers = await Promise.all(
        Object.keys(OAUTH_CONFIGS).map(async (provider) => ({
          provider,
          connectable: await isProviderConnectable(provider),
        })),
      );
      return { providers };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/auth/oauth/callback — OAuth provider redirects here
  app.get('/api/auth/oauth/callback', async (request, reply) => {
    try {
      const { code, state, error: oauthError } = request.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      // Handle provider error (user denied access)
      if (oauthError) {
        reply.type('text/html');
        return oauthResponseHtml(false, '', `Authorization denied: ${oauthError}`);
      }

      if (!code || !state) {
        reply.type('text/html');
        return oauthResponseHtml(false, '', 'Missing authorization code or state parameter');
      }

      // Verify CSRF state token
      const stateData = await verifyOAuthState(state);
      if (!stateData) {
        reply.type('text/html');
        return oauthResponseHtml(
          false,
          '',
          'Invalid or expired state token. This could be a CSRF attempt or your session expired. Please try connecting again.',
        );
      }

      const { connectorId, provider } = stateData;

      // Exchange code for tokens — pass the codeVerifier if available (PKCE)
      const tokenResult = await exchangeCodeForTokens(provider, code, stateData.codeVerifier);

      // Store tokens
      await credentialStore.storeCredential(connectorId, 'accessToken', tokenResult.accessToken);
      if (tokenResult.refreshToken) {
        await credentialStore.storeCredential(connectorId, 'refreshToken', tokenResult.refreshToken);
      }
      if (tokenResult.expiresIn) {
        const expiresAt = Date.now() + tokenResult.expiresIn * 1000;
        await credentialStore.storeCredential(connectorId, 'tokenExpiresAt', String(expiresAt));
      }

      // Enrich the connector with the sub-account ids each platform needs
      // (Instagram business account, Facebook page, Threads user, etc.)
      await enrichConnectorAfterOAuth(connectorId, provider, tokenResult.accessToken);

      // Look up the connector and mark it active
      try {
        const connector = await registry.getById(connectorId);
        if (connector) {
          await registry.setStatus(connectorId, 'active');
        } else {
          // Connector may not exist yet if it was created on the fly
          // We need to create it
          const preset = (await import('../connectors/presets')).PRESET_CONNECTORS.find(
            (p) => p.provider === provider,
          );
          if (preset) {
            await registry.create({
              name: preset.name,
              type: preset.type as any,
              provider: preset.provider,
              status: 'active',
              config: { tools: preset.tools, serverType: 'builtin' },
            });
          }
        }
      } catch (connErr) {
        console.error(`[OAuth] Failed to update connector ${connectorId}:`, connErr);
      }

      // Return success HTML that closes the popup
      reply.type('text/html');
      return oauthResponseHtml(true, connectorId);
    } catch (err: any) {
      console.error('[OAuth] Callback error:', err);
      reply.type('text/html');
      return oauthResponseHtml(false, '', err.message || 'OAuth token exchange failed');
    }
  });
}
