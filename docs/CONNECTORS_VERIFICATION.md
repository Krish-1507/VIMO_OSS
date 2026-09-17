# Connector Hub & Social Accounts — Verification Playbook

This document is the manual + automated verification plan for the Pack
Marketplace and the Social Accounts connector layer. It was produced
alongside the audit and fix pass — every behaviour listed here is also
covered by `packages/backend/src/tests/connectorsMarketplaceRoutes.test.ts`.

## TL;DR

- **All 266 backend tests + 143 frontend tests pass** (run `npm test` in the
  repo root). A Playwright smoke (`npm run test:e2e`) additionally boots the
  real app, performs first-run PIN setup, runs the Marketing Director, and
  checks the webhook, approval, and CSV-export endpoints end-to-end.
- **Pack install / uninstall is now atomic.** A pack uninstall always
  tears down the underlying connectors too, so we never leave orphaned
  credentials or dead MCP server sockets behind.
- **Pack install is idempotent.** Installing the same pack twice no longer
  throws or duplicates the row; it returns 200 with `alreadyInstalled: true`.
- **Bad payloads are rejected** with honest 400s (non-object config,
  non-array discovery items, missing `packId`, etc.) instead of being
  persisted as broken JSON.
- **Social-account disconnect is now honest.** Disconnecting a non-existent
  connector returns 404. Disconnecting a platform with zero connections
  returns 200 with `disconnected: 0` instead of pretending to do work.
- **OAuth popup is leak-free.** The single-`finalize` pattern in
  `vimoSocialService.openOAuthPopup` guarantees every timer is cleared
  exactly once, no matter which path (poll success, popup-closed,
  grace-timeout) wins the race.
- **App-password connectors (Bluesky) validate inputs** before touching
  the DB. A short app password or a missing handle is a clean 400.
- **OAuth handshakes adopt their tokens.** Pack flows start under a synthetic
  id; the callback moves those credentials onto the created connector row (and
  enriches it), so no "connected" row is ever left without tokens.
- **One-click Reconnect actually reconnects.** The health dashboard uses the
  session + CSRF client (raw fetches used to die with 403), the hourly cron
  refreshes expiring OAuth tokens, and attention banners deep-link social
  logins to Social Accounts and packs to the Connector Hub.

---

## Automated test commands

From the repo root:

```bash
npm run test:backend -- --reporter=verbose src/tests/connectorsMarketplaceRoutes.test.ts src/tests/oauthCallbackAdoption.test.ts
npm run test:backend
npm run test:frontend
```

You should see:

- `connectorsMarketplaceRoutes.test.ts`: **26/26 passing** (real Fastify
  app, real session token + CSRF, real DB, mocked axios only).
- `oauthCallbackAdoption.test.ts`: handshake credentials land on the real
  connector row; pre-existing rows are reused, never duplicated.
- Full backend suite: **266/266 passing** across 35 test files.
- Frontend: **143/143 passing** across 4 test files.

---

## Manual smoke tests

### 1. Pack install → uninstall round trip

1. Start VIMO (`Start VIMO.bat` on Windows or `npm run dev`).
2. Set a PIN and complete onboarding if you haven't.
3. Navigate to **Connector Hub** (`/connectors`).
4. Click **Install** on the **GitHub Knowledge Pack**.
5. Follow the Setup Assistant. It will:
   - Check the real GitHub API for your repos (via `discoverPack`).
   - Persist the pack on `installed_packs`.
   - Create a `connectors` row + encrypted credentials.
6. Reload the page. The pack should appear under **Installed Packs** with
   the green checkmark.
7. Click the pack → **Remove** → **Confirm Remove**.
8. Reload. The pack should be gone, and `/api/connectors` should no
   longer return the GitHub connector.
9. Open `packages/backend/data/vimo.db` with any SQLite browser. Run
   `SELECT * FROM installed_packs WHERE pack_id='github-knowledge';` —
   should return zero rows. `SELECT * FROM connectors WHERE
   provider='github';` — should also return zero rows.

### 2. Pack install idempotency

1. From the same Connector Hub, install any pack (e.g. **Notion
   Knowledge**).
2. Open the browser dev tools Network tab.
3. From the console, run:

   ```js
   const t = localStorage.getItem('session_token');
   await fetch('/api/packs/install', {
     method: 'POST',
     headers: { 'content-type': 'application/json', 'x-session-token': t, 'x-csrf-token': t },
     body: JSON.stringify({ packId: 'notion-knowledge', packName: 'Notion Knowledge', category: 'knowledge_packs', provider: 'notion' }),
   }).then(r => r.json()).then(console.log);
   ```

4. Expected: `{ installed: true, alreadyInstalled: true, message: '...', pack: {...} }`.
   The HTTP status will be `200` (not `201`).
5. The `installed_packs` table still has exactly **one** row for that
   pack. Confirm in SQLite.

### 3. Disconnect a non-existent social account

1. From `/social-accounts` (or anywhere), open the browser dev tools.
2. From the console, run:

   ```js
   const t = localStorage.getItem('session_token');
   await fetch('/api/social-accounts/disconnect/instagram', {
     method: 'POST',
     headers: { 'content-type': 'application/json', 'x-session-token': t, 'x-csrf-token': t },
     body: JSON.stringify({ connectorId: 'fake-id' }),
   }).then(r => ({ status: r.status, body: r.json() }));
   ```

3. Expected: `status: 404`, body has `success: false` and a clear
   "not found" error. **No 500.** The database is untouched.

### 4. App-password provider validation (Bluesky)

1. From the browser console:

   ```js
   const t = localStorage.getItem('session_token');
   await fetch('/api/social-accounts/connect-app-password', {
     method: 'POST',
     headers: { 'content-type': 'application/json', 'x-session-token': t, 'x-csrf-token': t },
     body: JSON.stringify({ provider: 'bluesky' }),
   }).then(r => r.json());
   ```

2. Expected: `400`, `error: /credential value/i`.
3. Try with a short app password:

   ```js
   body: JSON.stringify({ provider: 'bluesky', handle: 'me.bsky.social', appPassword: 'short' })
   ```

4. Expected: `400`, `error: /app password/i`.

### 5. OAuth popup cleanup

1. Open `/social-accounts`, click **Connect Instagram**.
2. A popup opens. **Close it without authorizing.**
3. Wait ~5 seconds. The main window's "Connecting…" spinner should clear
   and the **Connect Instagram** button should be re-enabled.
4. Open Chrome DevTools → Memory tab → take a heap snapshot. Click
   **Connect** again, close the popup. Take another snapshot.
5. The number of `setInterval` / `setTimeout` listeners should NOT grow
   linearly with connect attempts. (The pre-fix code leaked one interval
   per cancel.)

---

## What the test suite covers

`packages/backend/src/tests/connectorsMarketplaceRoutes.test.ts` runs the
actual `packInsightsRoutes` and `socialAccountsRoutes` handlers mounted on
a real Fastify app, against an in-memory SQLite DB, with a real session
token + CSRF token. The only mocked boundary is `axios` so the test never
hits the open Internet.

It asserts:

- **Pack install** rejects missing fields, non-object config, non-array
  `discoveryItems`.
- **Pack install** succeeds with 201 for valid payloads.
- **Pack install** is idempotent — second call returns 200 with
  `alreadyInstalled: true` and does not duplicate the row.
- **Pack install** requires CSRF (returns 403 without `x-csrf-token`).
- **Pack install** requires session (returns 401 without `x-session-token`).
- **Pack uninstall** returns 400 when `packId` is missing.
- **Pack uninstall** returns 404 when the pack is not installed (instead
  of silently returning success).
- **Pack uninstall** removes the pack row AND the connectors it owns,
  verified directly against the DB.
- **Pack uninstall** falls back to the `packId` → provider map when the
  caller doesn't send an explicit `provider`.
- **`GET /api/packs/installed`** returns packs scoped to the requested
  brand profile.
- **Disconnect `all`** with no connectors returns 200 with
  `disconnected: 0` (not 500).
- **Disconnect `all`** with multiple connectors tears them all down and
  reports the count.
- **Disconnect by `connectorId`** returns 404 when the connector does
  not exist.
- **`/api/social-accounts/oauth-status/:id`** returns 410 Gone for
  cleaned-up connectors (so the popup can give up cleanly).
- **`/api/social-accounts/oauth-status/:id`** returns 200 with the
  current status when the connector exists.
- **`/api/social-accounts/connect-app-password`** rejects empty
  payloads, missing Bluesky handle, short Bluesky app password.
- **`/api/social-accounts/connect-app-password`** accepts a valid Bluesky
  handle + app password and persists the connector.
- **`/api/social-accounts/save-credentials`** rejects missing fields and
  normalizes the provider key (`instagram` → `instagram_facebook`).
- **`/api/social-accounts/connect/myspace`** returns 400 with
  `needsSetup: true` for unsupported platforms.
