import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';

const registry = new ConnectorRegistry(db);
const PLUGINS_KEY = 'vimo_plugins';

async function readPlugins(): Promise<any[]> {
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, PLUGINS_KEY)).get();
    const parsed = row?.value ? JSON.parse(row.value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePlugins(plugins: any[]): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: PLUGINS_KEY, value: JSON.stringify(plugins), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(plugins), updatedAt: new Date().toISOString() } });
}

/**
 * Plugin API
 *
 * A plugin is a third-party connector definition (name, provider, auth, a set
 * of "actions" with their HTTP request templates) that a developer can register
 * with VIMO at runtime. Registered plugins appear in the Connector Hub and can
 * be wired into a real connector via POST /api/plugins/:id/install.
 */
export default async function pluginRoutes(app: FastifyInstance) {
  // List registered plugins
  app.get('/api/plugins', async () => {
    return { plugins: await readPlugins() };
  });

  // Register a new plugin
  app.post('/api/plugins/register', async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        provider: string;
        description?: string;
        authType?: 'api_key' | 'oauth2' | 'none';
        requiredCredentials?: { key: string; label: string; placeholder?: string; isSecret?: boolean }[];
        actions?: { name: string; description: string; method?: string; url?: string; bodyTemplate?: unknown }[];
      };

      if (!body.name || !body.provider) {
        return reply.status(400).send({ error: 'name and provider are required' });
      }

      const plugins = await readPlugins();
      const id = `plugin-${body.provider}-${Date.now().toString(36)}`;
      const plugin = {
        id,
        name: body.name,
        provider: body.provider,
        description: body.description || `Plugin: ${body.name}`,
        authType: body.authType || 'api_key',
        requiredCredentials: body.requiredCredentials || [],
        actions: body.actions || [],
        registeredAt: new Date().toISOString(),
      };
      plugins.push(plugin);
      await writePlugins(plugins);
      return reply.status(201).send({ plugin });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Update an existing plugin
  app.put('/api/plugins/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const plugins = await readPlugins();
      const idx = plugins.findIndex((p) => p.id === id);
      if (idx === -1) return reply.status(404).send({ error: 'Plugin not found' });
      plugins[idx] = { ...plugins[idx], ...body, id };
      await writePlugins(plugins);
      return { plugin: plugins[idx] };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Delete a plugin
  app.delete('/api/plugins/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const plugins = await readPlugins();
      const next = plugins.filter((p) => p.id !== id);
      if (next.length === plugins.length) return reply.status(404).send({ error: 'Plugin not found' });
      await writePlugins(next);
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Install a plugin as a real connector (so it shows up as Connected).
  app.post('/api/plugins/:id/install', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; accountLabel?: string; credentials?: Record<string, string> };
      const plugins = await readPlugins();
      const plugin = plugins.find((p) => p.id === id);
      if (!plugin) return reply.status(404).send({ error: 'Plugin not found' });

      const connector = await registry.create({
        name: body.name || plugin.name,
        type: 'custom',
        provider: plugin.provider,
        status: 'active',
        config: {
          pluginId: id,
          accountLabel: body.accountLabel || null,
          actions: plugin.actions,
          authType: plugin.authType,
        },
      });

      if (body.credentials && typeof body.credentials === 'object') {
        for (const [key, value] of Object.entries(body.credentials)) {
          await credentialStore.storeCredential(connector.id, key, String(value));
        }
      }

      return reply.status(201).send({ ...connector, encryptedCredentials: undefined });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Execute one of a plugin's registered actions against the real API.
  // Placeholders like {{apiKey}} or {{id}} in the URL and body template are
  // filled from the connector's stored credentials + the params passed here.
  app.post('/api/plugins/:id/run-action', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as { actionName: string; params?: Record<string, unknown> };
      const plugins = await readPlugins();
      const plugin = plugins.find((p) => p.id === id);
      if (!plugin) return reply.status(404).send({ error: 'Plugin not found' });

      const action = (plugin.actions || []).find((a: any) => a.name === body.actionName);
      if (!action) {
        return reply.status(400).send({ error: `Action "${body.actionName}" not found on plugin ${plugin.name}` });
      }

      const connectors = await registry.getAll();
      const connector = connectors.find((c) => c.provider === plugin.provider);
      if (!connector) {
        return reply.status(400).send({ error: `Install ${plugin.name} first so it can be invoked.` });
      }

      // Collect substitution values: action params override credentials.
      const params = (body.params as Record<string, unknown>) || {};
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        values[k] = String(v ?? '');
      }
      const credKeys = (plugin.requiredCredentials || []).map((c: any) => c.key);
      for (const key of credKeys) {
        if (values[key] !== undefined) continue;
        const stored = await credentialStore.getCredential(connector.id, key);
        if (stored) values[key] = stored;
      }

      const fill = (template: string): string =>
        template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');

      const method = String(action.method || 'GET').toUpperCase();
      const url = fill(String(action.url || ''));
      if (!/^https?:\/\//.test(url)) {
        return reply.status(400).send({ error: 'Plugin action URL must be an absolute http(s) URL.' });
      }

      let bodyTemplate: unknown = null;
      if (action.bodyTemplate) {
        try {
          const raw = fill(JSON.stringify(action.bodyTemplate));
          bodyTemplate = JSON.parse(raw);
        } catch {
          return reply.status(400).send({ error: 'Action body template is not valid JSON.' });
        }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (plugin.authType === 'api_key' && values.apiKey) {
        headers.Authorization = `Bearer ${values.apiKey}`;
      } else if (plugin.authType === 'api_key' && values.accessToken) {
        headers.Authorization = `Bearer ${values.accessToken}`;
      }

      const { default: axios } = await import('axios');
      const res = await axios.request({
        method,
        url,
        headers,
        data: bodyTemplate,
        timeout: 15000,
      });

      return {
        success: true,
        status: res.status,
        data: res.data,
      };
    } catch (err: any) {
      const status = err?.response?.status || 0;
      return reply.status(400).send({
        error: `Action failed (${status || 'network'}): ${err?.message || 'Unknown error'}`,
        responseData: err?.response?.data ?? null,
      });
    }
  });
}
