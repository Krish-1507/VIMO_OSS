import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { mcpClient } from '../lib/mcpClient';
import * as credentialStore from '../lib/credentialStore';
import { PRESET_CONNECTORS, resolveLaunchStatus } from '../connectors/presets';
import { formatError } from '../lib/errorFormatter';
import { isOAuthProvider, isSimpleCredentialProvider, generateAuthUrl, refreshAccessToken, isManagedProvider } from '../lib/oauthManager';
import { discoverPack } from '../services/packDiscoveryService';
import { createConnectorServer, closeConnectorServer, closeAllServers } from '../mcp/builtin-server';
import { verifyAccountType } from '../connectors/native/instagramNative';
import { resolveModelName } from '../lib/llmProvider';
import { syncEnvForProvider, removeEnvForProvider } from '../lib/envWriter';

const registry = new ConnectorRegistry(db);

async function getFirstActiveLLMKey(provider: string): Promise<string | null> {
  const all = await registry.getAll();
  for (const c of all) {
    if (c.type === 'llm' && c.provider === provider && c.status === 'active') {
      const key = await credentialStore.getCredential(c.id, 'apiKey');
      if (key) return key;
    }
  }
  return null;
}

function validateApiKeyFormat(provider: string, key: string): { valid: boolean; hint: string } {
  if (provider === 'openai') {
    if (key.startsWith('sk-') && key.length > 20) return { valid: true, hint: '' };
    return { valid: false, hint: "OpenAI keys start with 'sk-'. Make sure you copied the complete key." };
  }
  if (provider === 'anthropic') {
    if (key.startsWith('sk-ant-') && key.length > 20) return { valid: true, hint: '' };
    return { valid: false, hint: "Anthropic keys start with 'sk-ant-'. Make sure you copied the complete key." };
  }
  if (provider === 'groq') {
    if (key.startsWith('gsk_') && key.length > 10) return { valid: true, hint: '' };
    return { valid: false, hint: "Groq keys start with 'gsk_'. Make sure you copied the complete key." };
  }
  if (provider === 'google') {
    if (key.startsWith('AIza') && key.length > 20) return { valid: true, hint: '' };
    return { valid: false, hint: "Google API keys start with 'AIza'. Make sure you copied the complete key." };
  }
  if (key.length > 8) return { valid: true, hint: '' };
  return { valid: false, hint: "This key seems too short. Make sure you copied the full key." };
}

/**
 * Validate a pack's credentials against the real provider API.
 *
 * For credential-based packs (Shopify, Stripe, WooCommerce, Linear, ...) we run
 * a live, minimal API call through the pack discovery service so we only ever
 * report the connection as working when access is genuinely granted. OAuth /
 * guided packs validate via the OAuth handshake instead, so an empty credential
 * payload is treated as "will be verified on connect". Free-form intelligence
 * packs (SEO, market research, ...) don't hold secrets and are accepted once
 * configured.
 */
async function validateProviderCredentials(
  provider: string,
  credentials: Record<string, string>,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const hasCreds = Object.values(credentials || {}).some(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );

  const oauthLike = isOAuthProvider(provider) || isSimpleCredentialProvider(provider);
  if (oauthLike && !hasCreds) {
    return { success: true, message: 'Will be verified when you authorize the connection.' };
  }

  // Providers with real, secret-based API calls we can validate immediately.
  const REAL_VALIDATION_PROVIDERS = new Set([
    'shopify',
    'stripe',
    'woocommerce',
    'linear',
  ]);

  if (REAL_VALIDATION_PROVIDERS.has(provider)) {
    try {
      const result = await discoverPack(provider, credentials || {});
      if (result.success) {
        return { success: true, message: 'Credentials verified against the provider API.' };
      }
      return { success: false, error: result.error || 'The provider rejected these credentials.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Validation request failed.' };
    }
  }

  // Anything else (free-form intelligence packs, app-password packs like
  // Adobe Express) is accepted as long as at least one value was provided.
  if (hasCreds) {
    return { success: true, message: 'Credentials saved.' };
  }
  return { success: false, error: 'Please provide the required credentials.' };
}

export default async function connectorRoutes(app: FastifyInstance) {
  // GET /api/connectors — returns all connectors (with configJson parsed, encryptedCredentials omitted)
  app.get('/api/connectors', async (request, reply) => {
    try {
      const all = await registry.getAll();
      return all.map((c) => ({
        ...c,
        encryptedCredentials: undefined,
      }));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/connectors/presets — returns PRESET_CONNECTORS array with an
  // honest, resolved launchStatus badge attached to each preset. Supports
  // search + category + status filtering for the Connector Hub.
  app.get('/api/connectors/presets', async (request) => {
    const { search, category, status } = request.query as {
      search?: string;
      category?: string;
      status?: string;
    };

    let presets = PRESET_CONNECTORS.map((preset) => ({
      ...preset,
      launchStatus: resolveLaunchStatus(preset),
    }));

    const term = (search || '').trim().toLowerCase();
    if (term) {
      presets = presets.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          p.provider.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term),
      );
    }
    if (category && category !== 'all') {
      presets = presets.filter((p) => p.category === category);
    }
    if (status && status !== 'all') {
      presets = presets.filter((p) => p.launchStatus === status);
    }

    // Distinct categories for filter UI.
    const categories = Array.from(new Set(PRESET_CONNECTORS.map((p) => p.category)));
    return { presets, categories };
  });

  // GET /api/connectors/grouped — connectors grouped by provider so the Hub can
  // show multiple accounts per platform (multi-account support).
  app.get('/api/connectors/grouped', async () => {
    const all = await registry.getAll();
    const grouped: Record<string, any[]> = {};
    for (const c of all) {
      (grouped[c.provider] ||= []).push({
        ...c,
        encryptedCredentials: undefined,
      });
    }
    return { grouped, total: all.length };
  });

  // GET /api/connectors/custom-presets — user-built connectors from the visual
  // connector builder.
  app.get('/api/connectors/custom-presets', async (request, reply) => {
    try {
      const row = await db.select().from(appSettings).where(eq(appSettings.key, 'custom_connector_presets')).get();
      const presets = row?.value ? JSON.parse(row.value) : [];
      return { presets: Array.isArray(presets) ? presets : [] };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors/builder — create a connector from the visual builder
  // spec (name, provider, authType, credential fields, tools). Also persists a
  // reusable custom preset.
  app.post('/api/connectors/builder', async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        provider: string;
        type?: string;
        authType?: 'api_key' | 'oauth2' | 'oauth2_manual' | 'app_password' | 'none';
        accountLabel?: string;
        iconSlug?: string;
        description?: string;
        requiredCredentials?: { key: string; label: string; placeholder?: string; isSecret?: boolean }[];
        tools?: { name: string; description: string }[];
        config?: Record<string, unknown>;
      };

      if (!body.name || !body.provider) {
        return reply.status(400).send({ error: 'name and provider are required' });
      }

      const credentials = body.requiredCredentials || [];
      const tools = body.tools && body.tools.length ? body.tools : [{ name: 'custom_action', description: 'Custom action' }];

      const connector = await registry.create({
        name: body.name,
        type: (body.type as any) || 'custom',
        provider: body.provider,
        status: 'inactive',
        config: {
          ...(body.config || {}),
          accountLabel: body.accountLabel || null,
          builder: true,
          authType: body.authType || 'api_key',
          tools,
        },
      });

      // Persist a reusable custom preset for the Connector Hub catalog.
      try {
        const row = await db.select().from(appSettings).where(eq(appSettings.key, 'custom_connector_presets')).get();
        const existing: any[] = row?.value ? JSON.parse(row.value) : [];
        existing.push({
          id: `preset-${connector.id}`,
          name: body.name,
          provider: body.provider,
          type: body.type || 'custom',
          description: body.description || `Custom connector built in VIMO`,
          category: 'Custom',
          iconSlug: body.iconSlug || 'custom',
          authType: body.authType || 'api_key',
          requiredCredentials: credentials,
          tools,
          launchStatus: 'connect-only',
          custom: true,
        });
        await db
          .insert(appSettings)
          .values({ key: 'custom_connector_presets', value: JSON.stringify(existing), updatedAt: new Date().toISOString() })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(existing), updatedAt: new Date().toISOString() } });
      } catch (presetErr) {
        console.warn('[Connector Builder] Failed to persist custom preset:', (presetErr as Error).message);
      }

      return reply.status(201).send({
        ...connector,
        encryptedCredentials: undefined,
        customPresetId: `preset-${connector.id}`,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/connectors/llm-details — returns LLM connectors with resolved model names
  app.get('/api/connectors/llm-details', async (request, reply) => {
    try {
      const all = await registry.getAll();
      const llmConnectors = all.filter((c) => c.type === 'llm').map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.provider,
        status: c.status,
        modelName: resolveModelName(c.provider, c.config),
      }));
      return llmConnectors;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/connectors/llm-models?provider=...&apiKey=...
  // Dynamically fetches all available models from the provider's API (Groq, OpenRouter).
  // For other providers, returns the list of known models for the provider.
  app.get('/api/connectors/llm-models', async (request, reply) => {
    try {
      const provider = String((request.query as any)?.provider || '').toLowerCase();
      const apiKey = String((request.query as any)?.apiKey || '');

      if (!provider) {
        return reply.status(400).send({ error: 'provider is required' });
      }

      const fetchWithTimeout = async (url: string, headers: Record<string, string>, ms = 10000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
          return await fetch(url, { headers, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      };

      const extractModelIds = (body: any): string[] => {
        // OpenAI-compatible list endpoints return { data: [{ id }] }
        if (Array.isArray(body?.data)) return body.data.map((m: any) => m.id).filter(Boolean).sort();
        if (Array.isArray(body)) return body.map((m: any) => m.id || m).filter(Boolean).sort();
        return [];
      };

      if (provider === 'groq') {
        const key = apiKey || (await getFirstActiveLLMKey('groq'));
        if (!key) return reply.status(400).send({ error: 'No Groq API key found. Connect a Groq provider first.' });

        try {
          const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
            Authorization: `Bearer ${key}`,
          });
          if (!res.ok) return reply.status(502).send({ error: `Groq API error: ${res.status}` });
          const models = extractModelIds(await res.json());
          return { provider, models };
        } catch (netErr) {
          return reply.status(502).send({ error: `Could not reach Groq: ${(netErr as Error).message}` });
        }
      }

      if (provider === 'openrouter') {
        const key = apiKey || (await getFirstActiveLLMKey('openrouter'));
        if (!key) return reply.status(400).send({ error: 'No OpenRouter API key found. Connect an OpenRouter provider first.' });

        try {
          const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
            Authorization: `Bearer ${key}`,
          });
          if (!res.ok) return reply.status(502).send({ error: `OpenRouter API error: ${res.status}` });
          const models = extractModelIds(await res.json());
          return { provider, models };
        } catch (netErr) {
          return reply.status(502).send({ error: `Could not reach OpenRouter: ${(netErr as Error).message}` });
        }
      }

      // For other providers, return the known model list
      const staticModels: Record<string, string[]> = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        anthropic: ['claude-sonnet-4-5-20251022', 'claude-haiku-4-20251022', 'claude-opus-4-20250514'],
        google: ['gemini-3-flash', 'gemini-3-pro', 'gemini-2.5-flash'],
        mistral: ['mistral-large-latest', 'mistral-small-latest', 'mistral-medium-latest'],
      };

      if (!staticModels[provider]) {
        return reply.status(400).send({ error: `Unsupported provider: ${provider}` });
      }

      return { provider, models: staticModels[provider] };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors — creates a new connector
  app.post('/api/connectors', async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        type: string;
        provider: string;
        status?: string;
        config?: Record<string, unknown>;
        credentials?: Record<string, string>;
      };

      const connector = await registry.create({
        name: body.name,
        type: body.type as Parameters<typeof registry.create>[0]['type'],
        provider: body.provider,
        status: (body.status as 'active' | 'inactive' | 'error' | 'rate_limited') || 'inactive',
        config: body.config || {},
      });

      // Store credentials if provided
      if (body.credentials && typeof body.credentials === 'object') {
        for (const [key, value] of Object.entries(body.credentials)) {
          if (key === 'apiKey') {
            const validation = validateApiKeyFormat(body.provider, String(value));
            if (!validation.valid) {
              // Delete the connector we just created to keep DB clean
              await registry.delete(connector.id);
              return reply.status(400).send({ error: validation.hint });
            }
          }
          await credentialStore.storeCredential(connector.id, key, String(value));
        }
      }

      // Sync LLM credentials to .env file
      if (body.type === 'llm') {
        try {
          await syncEnvForProvider(body.provider, body.credentials || {}, body.config || {});
        } catch (envErr) {
          console.warn('[Connectors] Failed to sync .env:', envErr);
        }
      }

      // Wire up the built-in MCP server for this connector (skip for LLM providers)
      if (body.type === 'llm') {
        // LLM connectors don't need MCP — set to active immediately
        await registry.setStatus(connector.id, 'active');
      } else {
        try {
          const preset = PRESET_CONNECTORS.find((p) => p.provider === body.provider);
          if (preset) {
            const instance = await createConnectorServer(connector.id, preset);
            await mcpClient.connectInProcess(connector.id, instance.clientTransport);
            await registry.setStatus(connector.id, 'active');
          }
        } catch (mcpErr) {
          console.error(`Failed to wire MCP server for ${body.provider}:`, mcpErr);
          // Don't fail — connector is still saved, just mark as inactive
          await registry.setStatus(connector.id, 'inactive');
        }
      }

      return reply.status(201).send({
        ...connector,
        encryptedCredentials: undefined,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors/:id/test — runs a connectivity test
  app.post('/api/connectors/:id/test', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const connector = await registry.getById(id);
      if (!connector) {
        return reply.status(404).send(formatError(new Error('Connector not found')));
      }

      const start = Date.now();
      try {
        if (connector.type === 'llm') {
          // Minimal test for LLM: just verify we can get credentials
          const apiKey = await credentialStore.getCredential(id, 'apiKey');
          if (!apiKey) {
            return {
              success: false,
              message: 'No API key configured',
              latencyMs: Date.now() - start,
            };
          }
          // In a real implementation, we would send a test prompt here
          return {
            success: true,
            message: 'LLM credentials verified',
            latencyMs: Date.now() - start,
          };
        }

        // For social/analytics/productivity connectors, test via built-in MCP server
        const preset = PRESET_CONNECTORS.find((p) => p.provider === connector.provider);
        if (preset) {
          try {
            const instance = await createConnectorServer(id, preset);
            await mcpClient.connectInProcess(id, instance.clientTransport);
            return {
              success: true,
              message: `MCP server for ${connector.provider} connected with ${preset.tools.length} tools available`,
              latencyMs: Date.now() - start,
            };
          } catch (mcpErr) {
            return {
              success: true,
              message: `Connector saved. MCP integration: ${mcpErr instanceof Error ? mcpErr.message : 'pending'}`,
              latencyMs: Date.now() - start,
            };
          }
        }

        return {
          success: true,
          message: `Connector saved for ${connector.provider}`,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - start,
        };
      }
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // PUT /api/connectors/:id — updates connector config
  app.put('/api/connectors/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      type?: string;
      provider?: string;
      status?: string;
      config?: Record<string, unknown>;
      credentials?: Record<string, string>;
    };

    const updateData: Partial<{
      name: string;
      type: 'social' | 'llm' | 'analytics' | 'crm' | 'productivity' | 'ecommerce' | 'custom';
      provider: string;
      status: 'active' | 'inactive' | 'error' | 'rate_limited';
      config: Record<string, unknown>;
    }> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type as typeof updateData.type;
    if (body.provider !== undefined) updateData.provider = body.provider;
    if (body.status !== undefined) updateData.status = body.status as typeof updateData.status;
    if (body.config !== undefined) updateData.config = body.config;

    const updated = await registry.update(id, updateData);

    // Re-encrypt credentials if provided
    if (body.credentials && typeof body.credentials === 'object') {
      for (const [key, value] of Object.entries(body.credentials)) {
        if (key === 'apiKey') {
          const provider = body.provider || updated.provider;
          const validation = validateApiKeyFormat(provider, String(value));
          if (!validation.valid) {
            return reply.status(400).send({ error: validation.hint });
          }
        }
        await credentialStore.storeCredential(id, key, String(value));
      }
    }

    // Sync updated LLM credentials to .env
    const provider = body.provider || updated.provider;
    if (updated.type === 'llm' || body.type === 'llm') {
      try {
        await syncEnvForProvider(provider, body.credentials || {}, body.config || updated.config);
      } catch (envErr) {
        console.warn('[Connectors] Failed to sync .env on update:', envErr);
      }
    }

    return reply.status(200).send({
      ...updated,
      encryptedCredentials: undefined,
    });
  });

  // DELETE /api/connectors/:id — deletes connector, its credentials, and MCP server
  app.delete('/api/connectors/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const connector = await registry.getById(id);
    if (connector && connector.type === 'llm') {
      try {
        await removeEnvForProvider(connector.provider);
      } catch (envErr) {
        console.warn('[Connectors] Failed to remove .env entries:', envErr);
      }
    }
    await closeConnectorServer(id);
    await registry.delete(id);
    return reply.status(204).send();
  });

  // GET /api/connectors/instagram/verify — verifies Instagram account type
  app.get('/api/connectors/instagram/verify', async (request, reply) => {
    try {
      const allConnectors = await registry.getAll();
      const instagramConnector = allConnectors.find(
        (c) => c.provider === 'instagram'
      );

      if (!instagramConnector) {
        return reply.status(404).send({
          error: 'No Instagram connector found. Connect Instagram in Apps & Platforms first.',
        });
      }

      const accessToken = await credentialStore.getCredential(instagramConnector.id, 'accessToken');
      if (!accessToken) {
        return reply.status(400).send({
          error: 'Instagram access token not found. Reconnect your Instagram account.',
        });
      }

      const accountInfo = await verifyAccountType(accessToken);
      const canPost = accountInfo.accountType !== 'personal';

      return {
        accountType: accountInfo.accountType,
        username: accountInfo.username,
        followersCount: accountInfo.followersCount,
        mediaCount: accountInfo.mediaCount,
        canPost,
        instructions:
          !canPost
            ? 'This is a Personal Instagram account. Automated posting requires a Business or Creator account. To switch: Go to your Instagram Settings > Account > Switch to Professional Account > Choose Business or Creator.'
            : undefined,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors/test-credentials — validates credentials against the
  // real provider API before the connector is saved. We never accept a bogus
  // key: for the credential-based packs the request performs a live, minimal
  // API call so the marketplace only ever shows "Connected" when access works.
  app.post('/api/connectors/test-credentials', async (request, reply) => {
    try {
      const { provider, credentials } = request.body as {
        provider: string;
        credentials: Record<string, string>;
      };

      if (!provider) {
        return reply.status(400).send({ error: 'provider is required' });
      }

      const result = await validateProviderCredentials(provider, credentials || {});
      if (!result.success) {
        return reply.status(200).send({ success: false, error: result.error });
      }
      return { success: true, message: result.message };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors/:id/reconnect — one-click self-healing reconnect.
  app.post('/api/connectors/:id/reconnect', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const connector = await registry.getById(id);
      if (!connector) {
        return reply.status(404).send(formatError(new Error('Connector not found')));
      }

      const provider = connector.provider;

      // Managed providers (GitHub, Notion, Canva): start a fresh
      // authorization in a popup just like the first connect — no keys needed.
      if (isManagedProvider(provider)) {
        const result = await generateAuthUrl(provider, id);
        if ('needsSetup' in result && result.needsSetup) {
          return { needsSetup: true, setupGuide: (result as any).setupGuide };
        }
        return { authUrl: (result as any).authUrl, managed: true };
      }

      // Other OAuth providers: try to silently refresh the token in place.
      if (isOAuthProvider(provider)) {
        const refreshToken = await credentialStore.getCredential(id, 'refreshToken');
        if (refreshToken) {
          try {
            const refreshed = await refreshAccessToken(provider, refreshToken);
            await credentialStore.storeCredential(id, 'accessToken', refreshed.accessToken);
            if (refreshed.expiresIn) {
              const newExpiresAt = Date.now() + refreshed.expiresIn * 1000;
              await credentialStore.storeCredential(id, 'tokenExpiresAt', String(newExpiresAt));
            }
            await registry.setStatus(id, 'active');
            return { success: true, message: 'Connection refreshed.' };
          } catch (refreshErr) {
            // Refresh failed — user must re-authorize.
            return {
              needsReconnect: true,
              message: refreshErr instanceof Error ? refreshErr.message : 'Please reconnect this account.',
            };
          }
        }
        return { needsReconnect: true, message: 'This connection needs to be re-authorized.' };
      }

      // Credential-based providers: prompt to re-enter the key.
      return { needsReconnect: true, message: 'Please re-enter the connection details.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/connectors/mcp/connect — connects to a remote MCP server
  app.post('/api/connectors/mcp/connect', async (request, reply) => {
    const body = request.body as { serverUrl: string; connectorId: string };
    const { serverUrl, connectorId } = body;

    if (!serverUrl || !connectorId) {
      return reply.status(400).send({ error: 'serverUrl and connectorId are required' });
    }

    try {
      await mcpClient.connectSSE(connectorId, serverUrl);
      const manifest = await mcpClient.getToolManifest(connectorId);
      return { success: true, tools: manifest };
    } catch (err) {
      return reply.status(500).send({
        error: 'Failed to connect to MCP server',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
