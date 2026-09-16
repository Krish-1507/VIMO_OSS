---
"@vimo/frontend": patch
"@vimo/backend": patch
---

Reliability + performance pass: Director runs are observable, the bundle is split, mobile is fixed, and connections stay alive.

- **Backend**: Director sessions persist a `running` row up front and end `completed`/`failed` (new `status` column + backfill); keyless mode excludes the dead built-in free tier from the provider chain so pipelines hit instant fallbacks instead of hanging; OAuth callbacks adopt handshake credentials onto the real connector row; attention alerts carry provider/kind for smart routing.
- **Frontend**: route-level code-splitting (124KB shell, per-page chunks, shared vendors) plus a tree-shakeable icon map (ConnectorHub 849KB → 139KB); health dashboard uses the session+CSRF client so Reconnect works; alert banners deep-link social logins to Social Accounts; audit table scrolls with an empty state; toasts fit small phones; brand switcher in the sidebar.
- **Docs**: README, GET_STARTED, and CONNECTORS_VERIFICATION updated (241 tests / 31 files, new guarantees, agent front door).
