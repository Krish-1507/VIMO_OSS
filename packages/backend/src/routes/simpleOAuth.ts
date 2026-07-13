/**
 * Simplified OAuth Routes - One-Click Connector Integration
 * 
 * Flow: User clicks Connect -> Popup opens -> OAuth screen -> Login -> Allow -> 
 * Tokens received -> Stored encrypted -> Connected
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import {
  SIMPLE_OAUTH_PROVIDERS,
  generateOAuthState,
  verifyOAuthState,
  getAuthUrl,
  exchangeCodeForTokens,
  generateCodeVerifier,
  generateCodeChallenge,
} from '../lib/simpleOAuth';

const registry = {
  async create(data: {
    name: string;
    type: string;
    provider: string;
    status: string;
    config?: Record<string, unknown>;
  }) {
    const id = crypto.randomUUID();
    await db.insert(connectors).values({
      id,
      name: data.name,
      type: data.type as any,
      provider: data.provider,
      status: data.status as any,
      configJson: JSON.stringify(data.config || {}),
      encryptedCredentials: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { id, ...data };
  },

  async setStatus(id: string, status: string) {
    await db
      .update(connectors)
      .set({ status: status as any, updatedAt: new Date().toISOString() })
      .where(eq(connectors.id, id));
  },

  async getById(id: string) {
    return db.select().from(connectors).where(eq(connectors.id, id)).get();
  },
};

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

export default async function simpleOAuthRoutes(app: FastifyInstance) {
  // GET /api/auth/simple-oauth/start - Start the simplified OAuth flow
  app.get('/api/auth/simple-oauth/start', async (request, reply) => {
    try {
      const { provider } = request.query as { provider: string };

      if (!provider) {
        return reply.status(400).send({ error: 'provider query parameter is required' });
      }

      const config = SIMPLE_OAUTH_PROVIDERS.find((p) => p.provider === provider);
      if (!config) {
        return reply.status(400).send({ error: `OAuth provider not supported: ${provider}` });
      }

      // Check if OAuth credentials are configured before starting
      const { areOAuthCredentialsConfigured } = await import('../lib/simpleOAuth');
      if (!areOAuthCredentialsConfigured(provider)) {
        return reply.status(400).send({
          error: `OAuth credentials for ${provider} are not configured. ` +
                 `Please set VIMO_${provider.toUpperCase()}_CLIENT_ID and ` +
                 `VIMO_${provider.toUpperCase()}_CLIENT_SECRET environment variables.`,
          needsConfiguration: true,
          provider,
        });
      }

      // Generate PKCE parameters if needed
      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      if (['github', 'google', 'canva'].includes(provider)) {
        codeVerifier = generateCodeVerifier();
        codeChallenge = generateCodeChallenge(codeVerifier);
      }

      // Create connector first (will be updated after OAuth)
      const connector = await registry.create({
        name: config.name,
        type: 'social',
        provider,
        status: 'pending',
        config: {},
      });

      // Generate state
      const state = generateOAuthState(connector.id, provider, codeVerifier);

      // Get authorization URL
      const authUrl = getAuthUrl(provider, state, codeChallenge);

      return {
        authUrl,
        connectorId: connector.id,
        provider,
        popup: true,
        popupOptions: {
          width: 500,
          height: 600,
          // Explicitly type window as `any` because this file runs in Node
          // and does not have DOM lib types enabled.
          left: (window: any) => Math.round((window.screen.width - 500) / 2),
          top: (window: any) => Math.round((window.screen.height - 600) / 2),
        },
      };
    } catch (err: any) {
      console.error('[SimpleOAuth] Start error:', err);
      return reply.status(500).send({ error: err.message || 'Failed to start OAuth flow' });
    }
  });

  // GET /api/auth/simple-oauth/callback - OAuth callback
  app.get('/api/auth/simple-oauth/callback', async (request, reply) => {
    try {
      const { code, state, error } = request.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      // Handle provider error
      if (error) {
        reply.type('text/html');
        return oauthResponseHtml(false, '', `Authorization denied: ${error}`);
      }

      if (!code || !state) {
        reply.type('text/html');
        return oauthResponseHtml(false, '', 'Missing authorization code or state parameter');
      }

      // Verify state
      const stateData = verifyOAuthState(state);
      if (!stateData) {
        reply.type('text/html');
        return oauthResponseHtml(
          false,
          '',
          'Invalid or expired state token. Please try again.'
        );
      }

      const { connectorId, provider, codeVerifier } = stateData;

      // Exchange code for tokens
      const tokenResult = await exchangeCodeForTokens(provider, code, codeVerifier);

      // Store tokens
      await credentialStore.storeCredential(connectorId, 'accessToken', tokenResult.accessToken);
      if (tokenResult.refreshToken) {
        await credentialStore.storeCredential(connectorId, 'refreshToken', tokenResult.refreshToken);
      }
      if (tokenResult.expiresIn) {
        const expiresAt = Date.now() + tokenResult.expiresIn * 1000;
        await credentialStore.storeCredential(connectorId, 'tokenExpiresAt', String(expiresAt));
      }

      // Update connector status
      await registry.setStatus(connectorId, 'active');

      // Return success HTML
      reply.type('text/html');
      return oauthResponseHtml(true, connectorId);
    } catch (err: any) {
      console.error('[SimpleOAuth] Callback error:', err);
      reply.type('text/html');
      return oauthResponseHtml(false, '', err.message || 'OAuth callback failed');
    }
  });
}
