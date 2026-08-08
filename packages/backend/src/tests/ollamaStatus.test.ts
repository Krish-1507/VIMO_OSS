/**
 * End-to-end route tests — Ollama auto-detect + local AI test flow.
 *
 * These tests boot a real Fastify app, mount the actual `connectorRoutes`
 * handlers, and exercise them over HTTP with a valid session + CSRF token.
 * The DB is the in-memory SQLite from the test setup, and the only mocked
 * boundary is `fetch` (Node's global) so we never hit a real Ollama install.
 *
 * This proves that
 *  - a running Ollama install is detected with its model list,
 *  - `:latest` tags are stripped from model names,
 *  - the default model falls back sensibly when llama3 is absent,
 *  - a missing/offline Ollama reports available:false (not an error page),
 *  - a non-200 Ollama response reports available:false,
 *  - a custom baseUrl is honored,
 *  - the connector test endpoint verifies a local AI connection honestly
 *    (no API key needed) and fails honestly when Ollama is offline.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

import connectorRoutes from '../routes/connectors';
import { encryptSession } from '../lib/session';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { appSettings, connectors } from '../db/schema';

const SESSION_TOKEN = 'test-session-token-' + 'x'.repeat(40);
const CSRF_TOKEN = SESSION_TOKEN;

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('Ollama auto-detect + local AI — HTTP routes (real Fastify)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Seed a valid session like the real auth gate expects.
    const expiry = Date.now() + 24 * 60 * 60 * 1000;
    const encrypted = await encryptSession(SESSION_TOKEN, expiry);
    const existing = db.select().from(appSettings).where(eq(appSettings.key, 'session_token')).get();
    if (existing) {
      db.update(appSettings)
        .set({ value: encrypted, updatedAt: new Date().toISOString() })
        .where(eq(appSettings.key, 'session_token'))
        .run();
    } else {
      db.insert(appSettings)
        .values({ key: 'session_token', value: encrypted, updatedAt: new Date().toISOString() })
        .run();
    }

    // A pre-existing ollama connector used by the test-endpoint tests.
    const existingConn = db.select().from(connectors).where(eq(connectors.id, 'ollama-conn-test')).get();
    if (!existingConn) {
      db.insert(connectors)
        .values({
          id: 'ollama-conn-test',
          name: 'Ollama',
          type: 'llm',
          provider: 'ollama',
          status: 'active',
          configJson: JSON.stringify({ baseUrl: 'http://localhost:11434', modelName: 'llama3' }),
          encryptedCredentials: JSON.stringify({}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
    }

    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      // The status endpoint is public (used pre-auth during onboarding).
      if (pathname.startsWith('/api/connectors/ollama/status')) return;
      await requireAuth(request, reply);
      if (reply.sent) return;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const sessionToken = request.headers['x-session-token'];
        const csrfToken = request.headers['x-csrf-token'];
        if (!csrfToken || csrfToken !== sessionToken) {
          return reply.status(403).send({ error: 'Invalid or missing CSRF token' });
        }
      }
    });
    await app.register(connectorRoutes);
    await app.ready();

    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe('GET /api/connectors/ollama/status', () => {
    it('detects a running Ollama and lists its models (no auth needed)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        models: [{ name: 'llama3:latest', size: 4660000000 }, { name: 'qwen2.5:7b', size: 4700000000 }],
      }));

      const res = await app.inject({ method: 'GET', url: '/api/connectors/ollama/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.available).toBe(true);
      expect(body.baseUrl).toBe('http://localhost:11434');
      expect(body.models).toEqual([
        { name: 'llama3', size: 4660000000 },
        { name: 'qwen2.5:7b', size: 4700000000 },
      ]);
      expect(body.defaultModel).toBe('llama3');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('falls back to the first model (or llama3) when llama3 is absent', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        models: [{ name: 'qwen2.5:7b', size: 4700000000 }],
      }));
      const res = await app.inject({ method: 'GET', url: '/api/connectors/ollama/status' });
      expect(res.json().defaultModel).toBe('qwen2.5:7b');

      fetchMock.mockResolvedValue(jsonResponse({ models: [] }));
      const empty = await app.inject({ method: 'GET', url: '/api/connectors/ollama/status' });
      expect(empty.json().available).toBe(true);
      expect(empty.json().defaultModel).toBe('llama3');
    });

    it('honors a custom baseUrl query param', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ models: [] }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/connectors/ollama/status?baseUrl=http://localhost:1234/',
      });
      expect(res.json().available).toBe(true);
      expect(res.json().baseUrl).toBe('http://localhost:1234');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:1234/api/tags', expect.anything());
    });

    it('reports available:false when Ollama is offline (fetch rejects)', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await app.inject({ method: 'GET', url: '/api/connectors/ollama/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: false, baseUrl: 'http://localhost:11434' });
    });

    it('reports available:false on a non-200 response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const res = await app.inject({ method: 'GET', url: '/api/connectors/ollama/status' });
      expect(res.json()).toEqual({ available: false, baseUrl: 'http://localhost:11434' });
    });
  });

  describe('POST /api/connectors/:id/test (ollama provider)', () => {
    const headers = { 'x-session-token': SESSION_TOKEN, 'x-csrf-token': CSRF_TOKEN };

    it('passes without an API key when the local server answers', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'llama3:latest' }] }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/connectors/ollama-conn-test/test',
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('running');
    });

    it('fails honestly when the local server is offline', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/connectors/ollama-conn-test/test',
        headers,
      });
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('not reachable');
    });
  });
});
