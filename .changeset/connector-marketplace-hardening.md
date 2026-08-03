---
"@vimo/backend": patch
"@vimo/frontend": patch
---

Harden the Pack Marketplace and Social Accounts connector layer for production.

**Pack install / uninstall**

- `POST /api/packs/install` is now **idempotent** — re-installing the same pack returns
  `200` with `alreadyInstalled: true` instead of creating a duplicate row.
- The install payload is validated up front: non-object `config`, non-array
  `discoveryItems`, and missing `packId` / `packName` / `category` return `400` with a
  clear error instead of being persisted as broken JSON.
- The pack record now persists the connector `provider` so the uninstall path can
  reliably find and tear down the right connectors.
- `DELETE /api/packs/uninstall` is **atomic** — it removes the pack row and tears down
  the underlying connectors (credentials + MCP server sockets) in one shot, so we never
  leak orphaned rows.
- Uninstalling a pack that isn't installed returns `404` with a clear error, not a
  silent `200` no-op.

**Social Accounts**

- `POST /api/social-accounts/disconnect/:platform` is honest: a non-existent
  `connectorId` returns `404`; an empty platform returns `200` with `disconnected: 0`
  (no more `500` lies). The connector's MCP server is closed before the row is
  removed.
- `GET /api/social-accounts/oauth-status/:id` returns `410 Gone` for connectors that
  have been cleaned up, so the OAuth popup can give up cleanly.
- Bluesky (app-password) validates inputs up front — short app passwords or a missing
  handle are clean `400`s, not a half-written connector.
- The status endpoint runs a background sweep that reaps abandoned OAuth handshakes
  (inactive social connectors older than 15 minutes) so the Connector Hub doesn't
  accumulate "inactive" rows from users who closed the popup.

**Frontend**

- The OAuth popup flow (`vimoSocialService.openOAuthPopup`) now uses a single
  `finalize` channel so every `setInterval` is cleared exactly once — no more leaked
  timers on cancel/retry.
- `disconnectAccount` re-pulls state from the backend so the UI can't drift out of
  sync after a disconnect.
- `ConnectorHubPage` now sends the connector `provider` in the install payload and
  relies on the backend's atomic uninstall instead of deleting connectors from the
  client.

**Tests**

- New `connectorsMarketplaceRoutes.test.ts` (26 tests) mounts the real route handlers
  on a real Fastify app, exercises them over HTTP with a real session token + CSRF
  token, and asserts every behaviour above. The only mocked boundary is `axios`.
- Backend suite: **100/100 passing** across 13 files. Frontend: **9/9 passing**.
