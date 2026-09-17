---
"@vimo/frontend": patch
"@vimo/backend": patch
---

Simpler product, honester hosting: Team and Desktop Notifications removed, model routing fully unified, studios brand-aware, VPS deploy documented.

- **Backend**: retired the dead `modelAssignments` blob from routing (Settings per-task picks now drive everything; blob endpoints kept as deprecated); new side-effect-free `POST /api/media/enhance-prompt`; Higgsfield prompts brand-directed; `CORS_ORIGINS` allowlists public domains; Team endpoints removed.
- **Frontend**: local Ollama models selectable in Add AI Provider; Team tab and Desktop Notifications removed; profile saves debounced; studios style visuals with brand DNA; audit table + toasts + sidebar brand switcher mobile fixes.
- **Ship**: DEPLOY.md (launcher/systemd/Caddy + Compose + backups), hardened compose, nightly Docker build smoke, `vimo --host`, fixed Docker workspace manifests.
