---
"@vimo/frontend": patch
"@vimo/backend": patch
---

Unify model switching so Settings picks actually drive the agents, remove Team + Desktop Notifications, and make VPS hosting OpenClaw-simple.

- **Backend**: `getModelForTask` now honors the Settings per-task picks (legacy blob → UI `model_<task>` keys → capability auto-assign) instead of silently ignoring them; background task names alias to UI picks in the provider chain; attention alerts route social logins to Social Accounts; `CORS_ORIGINS` allowlists public domains; Team endpoints removed.
- **Frontend**: local Ollama models are selectable in Add AI Provider (no more hardcoded `llama3` assumption); profile saves are debounced with save feedback plus an email sanity hint; Team tab and Desktop Notifications removed; audit table scrolls with an empty state; toasts fit small phones; brand switcher in the sidebar.
- **Ship**: `DEPLOY.md` (launcher + systemd + Caddy, Docker Compose, backups, troubleshooting), hardened compose (required key, parameterized URLs), nightly Docker build smoke, `vimo --host` flag, documented `.env` additions.
