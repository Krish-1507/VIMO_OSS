# INTEGRATION_ENGINE_STATUS.md

## Current Goal

Build VIMO’s **Integrations** system (under the hood uses MCP) with secure, non-technical UX.

## Progress (Phased)

### Phase 1 — Backend Foundation (Approved / In Progress)

- [ ] 1. Add built-in Integrations Catalog (catalog.json + catalog.ts)
- [ ] 2. Implement Integration Engine lifecycle (connect/list/actions/invoke/disconnect + retries/backoff/health)
- [ ] 3. Add DB persistence: `vimo_integrations` (drizzle migration + encrypted config/credentials + granted actions)
- [ ] 4. Implement REST API `/api/integrations/*` (replace current mock handlers)
- [ ] 5. Add local OAuth callback endpoint `/api/integrations/callback/:platform` (state + redirect validation; token storage stub)

### Phase 2 — Frontend Integrations UX

- [ ] Integrations page + cards + connect flow + permission prompts
- [ ] Replace `/connectors` UX route via redirect to `/integrations`

### Phase 3 — AI Designer End-to-End

- [ ] “✨ Create with AI Designer” flow: action invocation, previews grid, auto-resize, attach to composer

### Phase 4 — Tests & Docs

- [ ] Unit tests + sample echo integration test
- [ ] Internal contributor docs (MCP terminology internal-only)

## Notes

- User-facing UI must **never** show the term “MCP”. Use **Integrations** / **Connections** / **Actions** / **Data**.
