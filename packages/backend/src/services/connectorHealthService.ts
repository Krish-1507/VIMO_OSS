import { db } from '../db';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import { io } from '../index';
import cron from 'node-cron';
import axios from 'axios';
import { refreshAccessToken, isOAuthProvider, MANAGED_PROVIDERS } from '../lib/oauthManager';
import { createLogger } from '../lib/logger';

const log = createLogger('connector:health');

/**
 * Check all active connectors for health issues.
 * - LLM connectors: send a minimal test prompt
 * - Instagram connectors: verify token validity
 */
export async function checkAllConnectors(): Promise<void> {
  const registry = new ConnectorRegistry(db);
  const allConnectors = await registry.getAll();

  for (const connector of allConnectors) {
    if (connector.status === 'inactive') continue;

    if (connector.type === 'llm') {
      await checkLLMConnector(connector.id);
    } else if (connector.provider === 'instagram') {
      await checkInstagramConnector(connector.id);
    }

    // Auto-refresh OAuth tokens
    // Managed providers: refresh when within 7 days of expiry (automatic, no user action)
    // Guided providers: emit notification when within 30 days of expiry
    await tryRefreshOAuthToken(connector.id, connector.provider);
  }
}

/**
 * Attempt to refresh an OAuth token if it's expiring within 7 days.
 */
async function tryRefreshOAuthToken(connectorId: string, provider: string): Promise<void> {
  try {
    if (!isOAuthProvider(provider)) return;
    // Instagram has its own token refresh mechanism via refreshInstagramToken
    if (provider === 'instagram' || provider === 'instagram_facebook') return;

    const expiresAtStr = await credentialStore.getCredential(connectorId, 'tokenExpiresAt');
    if (!expiresAtStr) return;

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt)) return;

    // Managed providers (PKCE-based): refresh automatically within 7 days
    // Guided providers: notify at 30 days, auto-refresh at 7 days
    const isManaged = (MANAGED_PROVIDERS as readonly string[]).includes(provider);
    const notificationThreshold = isManaged ? 30 : 7; // days
    const autoRefreshThreshold = 7; // days

    const notificationDays = Date.now() + notificationThreshold * 24 * 60 * 60 * 1000;
    const autoRefreshDays = Date.now() + autoRefreshThreshold * 24 * 60 * 60 * 1000;

    // Check if we need to send a notification (30 days for guided, always for managed)
    if (expiresAt > autoRefreshDays) {
      // Token is still valid — check if we need to send a notification
      if (expiresAt <= notificationDays && !isManaged) {
        // Guided provider within 30 days — emit notification
        try {
          const { io } = await import('../index');
          io.emit('connector:needs_attention', {
            connectorId,
            reason: `Token expires in ${Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))} days. Please reconnect.`,
            type: 'token_expiring',
            expiresAt: new Date(expiresAt).toISOString(),
          });
        } catch { /* ignore */ }
      }
      return;
    }

    const refreshToken = await credentialStore.getCredential(connectorId, 'refreshToken');
    if (!refreshToken) {
      log.warn('Cannot refresh OAuth token — no refresh token stored', { connectorId, provider });
      return;
    }

    log.info('Refreshing OAuth token', { connectorId, provider, expiresAt: new Date(expiresAt).toISOString() });
    const result = await refreshAccessToken(provider, refreshToken);

    await credentialStore.storeCredential(connectorId, 'accessToken', result.accessToken);
    if (result.expiresIn) {
      const newExpiresAt = Date.now() + result.expiresIn * 1000;
      await credentialStore.storeCredential(connectorId, 'tokenExpiresAt', String(newExpiresAt));
    }

    const registry = new ConnectorRegistry(db);
    await registry.setStatus(connectorId, 'active');
    log.info('Refreshed token', { connectorId, provider });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error('Failed to refresh OAuth token', { connectorId, provider, err: msg });
  }
  return;
}

async function checkLLMConnector(connectorId: string): Promise<void> {
  try {
    const apiKey = await credentialStore.getCredential(connectorId, 'apiKey');
    if (!apiKey) {
      await updateConnectorStatus(connectorId, 'error', 'No API key configured');
      return;
    }

    const { getActiveLLMProvider, callWithProviderChain } = await import('../lib/llmProvider');
    const { generateText } = await import('ai');

    await callWithProviderChain(
      'connector health',
      async (provider, modelId) => {
        const { text } = await generateText({
          model: provider.chat(modelId),
          prompt: 'Say OK in one word.',
          maxTokens: 10,
        });
        return text;
      }
    );

    await updateConnectorStatus(connectorId, 'active', undefined, new Date().toISOString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await updateConnectorStatus(connectorId, 'error', msg);
  }
}

async function checkInstagramConnector(connectorId: string): Promise<void> {
  try {
    const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
    if (!accessToken) {
      await updateConnectorStatus(connectorId, 'inactive', 'No access token');
      io.emit('connector:needs_attention', { connectorId, reason: 'No access token configured' });
      return;
    }

    const { verifyAccountType } = await import('../connectors/native/instagramNative');
    await verifyAccountType(accessToken);
    await updateConnectorStatus(connectorId, 'active', undefined, new Date().toISOString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Error 190 = invalid/expired token
    if (msg.includes('190') || msg.includes('expired') || msg.includes('invalid')) {
      await updateConnectorStatus(connectorId, 'inactive', msg);
      io.emit('connector:needs_attention', { connectorId, reason: 'Instagram token has expired. Please reconnect.' });
    } else {
      await updateConnectorStatus(connectorId, 'error', msg);
      io.emit('connector:needs_attention', { connectorId, reason: msg });
    }
  }
}

async function updateConnectorStatus(
  connectorId: string,
  status: import('../lib/connectorRegistry').ConnectorStatus,
  _errorMessage?: string,
  _lastTestedAt?: string
): Promise<void> {
  const registry = new ConnectorRegistry(db);
  // Only update the status — do NOT store errors in config_json
  await registry.setStatus(connectorId, status);
}

/**
 * Attempt to exchange a short-lived Instagram token for a long-lived one.
 */
export async function refreshInstagramToken(connectorId: string): Promise<boolean> {
  try {
    const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
    const appId = await credentialStore.getCredential(connectorId, 'appId');
    const appSecret = await credentialStore.getCredential(connectorId, 'appSecret');

    if (!accessToken || !appId || !appSecret) {
      log.warn('Cannot refresh token — missing credentials', { connectorId });
      await updateConnectorStatus(connectorId, 'inactive', 'Missing appId or appSecret for token refresh');
      return false;
    }

    const res = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      },
    });

    const newToken = res.data?.access_token;
    if (!newToken) {
      log.error('Token refresh returned no token', { connectorId });
      await updateConnectorStatus(connectorId, 'inactive', 'Token refresh returned empty token');
      return false;
    }

    await credentialStore.storeCredential(connectorId, 'accessToken', newToken);
    await updateConnectorStatus(connectorId, 'active', undefined, new Date().toISOString());
    log.info('Successfully refreshed Instagram token', { connectorId });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error('Token refresh failed', { connectorId, err: msg });
    await updateConnectorStatus(connectorId, 'inactive', `Token refresh failed: ${msg}`);
    return false;
  }
}

/**
 * Initialize the hourly connector health check cron.
 */
export function initConnectorHealthCron(): void {
  cron.schedule('0 * * * *', async () => {
    log.info('Running connector health check');
    try {
      await checkAllConnectors();
    } catch (err) {
      log.error('Connector health check error', { err: (err as Error).message });
    }
  });
  log.info('Connector health check scheduled: every hour');
}
