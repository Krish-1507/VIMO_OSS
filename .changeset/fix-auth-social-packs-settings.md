---
"@vimo/frontend": patch
---

Fix the post-login glitch, harden Social Accounts + Pack Marketplace connections, and polish Settings.

- **Auth**: `hasPassedSystemCheck` is now reactive (storage + in-app event), the loading gate no longer flashes the wrong route, `isSetupComplete` syncs immediately after PIN setup/verify, and Login/Setup wait for the store before navigating to `/dashboard`.
- **Session renewal** uses the shared axios instance (correct baseURL/proxy + CSRF) and re-syncs the socket and auth store instead of forcing a hard reload.
- **Social Accounts**: OAuth popups no longer leak timers (single finalize channel, blocked-popup fast-fail, 5-minute expiry, 410 handling); Bluesky validates handle + app password up front with plain-English errors; cancelled authorizations show a helpful hint instead of a stuck spinner.
- **Pack Marketplace**: installed state reconciles `/api/connectors` + `/api/packs/installed` + social status; OAuth packs skip empty credential payloads; uninstall is optimistic with revert on real failure.
- **Settings**: new hero header with live counts + save indicator, pill nav on mobile, and debounced auto-save so typing never floods the API.
