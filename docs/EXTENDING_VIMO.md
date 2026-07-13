# Extending VIMO — Write Your Own Connector in ~50 Lines

VIMO is built so that **the easy thing is the right thing**. If you want VIMO to talk to a new
tool — a social platform, a CRM, a store, a data source — you add a small, declarative **preset**
plus a tiny **adapter**. You do not touch the agent loop, the publish pipeline, or the UI
machinery. The Marketing Director and Approval Queue keep working exactly as before.

This guide walks through the full path with a concrete, copy-paste example: a **Product Hunt**
intelligence pack that surfaces real launch signals into VIMO.

> Prefer to read code first? The real adapters live in
> `packages/backend/src/services/packIntegrations.ts` and the discovery fetchers in
> `packages/backend/src/services/packDiscoveryService.ts`.

---

## The mental model

There are three small pieces, and you usually only need two:

| Piece | File | What it does |
|---|---|---|
| **Preset** | `packages/backend/src/connectors/presets/index.ts` | Declares the connector to the UI: name, icon, auth type, required credentials, tools. Pure data. |
| **Discover fetcher** | `packages/backend/src/services/packDiscoveryService.ts` | A *live, read-only* probe that validates credentials and returns real discovery items. |
| **`PackAdapter`** | `packages/backend/src/services/packIntegrations.ts` | Pulls live data on each sync, records the outcome, and reports connection health. |

The key insight: **`discoverPack` is how VIMO validates and "discovers" — and the `PackAdapter` is
how it syncs.** Both talk to the *real* provider API. VIMO only ever shows "Connected" when the
call actually succeeds — it never fabricates metrics.

---

## Example: a Product Hunt intelligence pack (~50 lines)

### 1. Declare the preset (UI)

Add an entry to `PRESET_CONNECTORS` in `packages/backend/src/connectors/presets/index.ts`:

```ts
{
  id: 'preset-producthunt',
  name: 'Product Hunt',
  type: 'analytics',
  provider: 'producthunt',
  description: 'Track launches and hunt trends for your niche',
  category: 'Productivity',
  iconSlug: 'producthunt',
  connectorArchitecture: 'mcp',
  authType: 'api_key',
  requiredCredentials: [
    { key: 'apiKey', label: 'Developer Token', placeholder: 'YOUR_PH_TOKEN', isSecret: true,
      helpUrl: 'https://www.producthunt.com/v2/oauth/applications' },
  ],
  tools: [
    { name: 'get_top_posts', description: "Get today's top hunted products" },
  ],
  workflows: [
    { name: 'Launch Radar', description: 'Turn top hunts into trend content',
      trigger: 'New top-5 product detected', output: 'LinkedIn post, Twitter thread' },
  ],
},
```

### 2. Write the discover fetcher (validation + discovery)

In `packages/backend/src/services/packDiscoveryService.ts`, add a fetcher and register it:

```ts
async function discoverProductHunt(creds: Record<string, string>): Promise<DiscoveryResult> {
  const token = creds.apiKey;
  if (!token) return { success: false, items: [], error: 'Product Hunt requires a developer token' };
  try {
    const res = await axios.get('https://api.producthunt.com/v2/api/graphql', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { query: '{ posts(order: VOTES, first: 5) { edges { node { name tagline votesCount } } } }' },
    });
    const posts = res.data?.data?.posts?.edges ?? [];
    return {
      success: true,
      items: [
        { icon: 'TrendingUp', label: 'Top hunts tracked', value: String(posts.length) },
        { icon: 'ThumbsUp', label: 'Top votes', value: String(posts[0]?.node?.votesCount ?? 0) },
        { icon: 'Tag', label: 'Connected', value: 'Yes' },
      ],
    };
  } catch (err: any) {
    return { success: false, items: [], error: `Product Hunt API error: ${err?.response?.status || err.message}` };
  }
}

// In the discoveryFetchers registry:
discoveryFetchers['producthunt'] = discoverProductHunt;
```

That's it for the marketplace. VIMO will now **validate** the token on connect (a failed call →
"not connected") and **discover** real numbers to show the user.

### 3. (Optional) Add a sync adapter

If you want VIMO to *pull* Product Hunt data into its memory on a schedule, extend `PackAdapter`
in `packages/backend/src/services/packIntegrations.ts`:

```ts
class ProductHuntAdapter extends PackAdapter {
  getPackType() { return 'intelligence'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');
      const token = await this.getCredentials(connectorId, 'apiKey');
      if (!token) throw new Error('Product Hunt token not found');

      const connection = createExternalConnection('producthunt-pack',
        'https://api.producthunt.com/v2/api/graphql',
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      const res = await connection.post('', { /* query */ });
      const posts = res.data?.data?.posts?.edges ?? [];

      await this.recordSync(connectorId, { success: true, dataPoints: posts.length });
      return { success: true, itemsSynced: posts.length, errors: [], newDataFound: posts.length > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    return this.buildStatus(connector, 'producthunt', 'Product Hunt', 'intelligence', null);
  }
}
```

Then register it in the `PackAdapterRegistry` constructor:

```ts
this.adapters.set('producthunt', new ProductHuntAdapter());
```

---

## The contracts (so your tests can trust them)

**`discoverPack(provider, credentials) → DiscoveryResult`**

```ts
interface DiscoveryResult { success: boolean; items: { icon: string; label: string; value: string }[]; error?: string }
```

Return `success: true` only when the live API call worked. Return `success: false` with a real
error message otherwise. **Never return fake items.**

**`PackAdapter.sync(connectorId) → SyncResult`**

```ts
interface SyncResult { success: boolean; itemsSynced: number; errors: string[]; newDataFound: boolean }
```

Use the inherited helpers — they're the whole point:

- `this.getConnector(id)` — the real connector row.
- `this.getCredentials(id, key)` — the **decrypted** secret (you never touch crypto).
- `this.recordSync(id, { success, dataPoints, error? })` — persists the outcome onto the
  connector so the UI and health checks reflect reality.
- `this.buildStatus(...)` — standardizes the connection status object.

---

## Test it like we test everything else

Our connection-layer tests mock the **external API only** — never VIMO's logic. Mirror that when
you add a connector. See `packages/backend/src/tests/connectionPackMarketplace.test.ts`:

```ts
it('Product Hunt: validates a token by fetching top hunts', async () => {
  mockDirectGetRoutes([['api.producthunt.com', { data: { data: { posts: { edges: [/* ... */] } } } }]]);
  const res = await discoverPack('producthunt', { apiKey: 'ph_test' });
  expect(res.success).toBe(true);
});
```

The `axios` boundary is the **only** thing mocked. The credential store, connector registry, and
your adapter all run for real against an in-memory SQLite database.

---

## Open a PR

1. Fork → branch from `main`.
2. Add the preset, the discover fetcher, and (if needed) the adapter.
3. Add an integration test that mocks the external API.
4. Run `npm run test --workspace=packages/backend` and `npm run lint --workspace=packages/backend`.
5. Update the README connector tables if you added a user-facing integration.

That's the whole extension story. Fifty lines, one PR, and your tool is now a first-class part of
an autonomous marketing OS.
