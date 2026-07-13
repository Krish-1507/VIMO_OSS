# Contributing to VIMO

Thanks for wanting to contribute! VIMO is open-source and we welcome all contributions — code,
docs, bug reports, feature ideas, and design feedback. Our goal is simple: make it trivially easy
for an indie hacker or agency to extend VIMO, and make every change **provably** safe.

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/vimo.git
cd vimo
npm install

# Start development (frontend + backend)
npm run dev
```

Open http://localhost:5173. The system check runs automatically. Set a PIN (4–8 digits) to log in.
You can also click **"Try the Demo"** for a zero-setup sample brand.

## Project Structure

```
vimo/
├── packages/
│   ├── frontend/          # React + Vite + Tailwind
│   │   ├── pages/           # Route pages
│   │   ├── components/      # Reusable UI
│   │   ├── connector-packs/ # Pack marketplace
│   │   ├── social-accounts/ # Social login
│   │   ├── stores/          # Zustand stores
│   │   └── lib/             # API client, socket
│   ├── backend/           # Fastify + SQLite + Drizzle
│   │   ├── src/
│   │   │   ├── routes/          # API endpoints
│   │   │   ├── services/         # Business logic (incl. packIntegrations, packDiscoveryService)
│   │   │   ├── connectors/       # Presets + native handlers
│   │   │   ├── agents/           # AI agents (Marketing Director)
│   │   │   ├── lib/              # OAuth, LLM, auth, credentialStore
│   │   │   ├── db/               # Schema, migrations
│   │   │   └── tests/            # Vitest integration tests
│   │   └── vitest.config.ts
│   └── shared/             # Shared types/schemas
├── docs/
│   └── EXTENDING_VIMO.md  # Write your own connector in ~50 lines
├── docker-compose.yml
└── package.json
```

## Connection-layer tests are required for integration work

If you touch anything in the Connection Layer — social connect/publish, the Pack Marketplace
(discover/validate/sync), or a `PackAdapter` — **ship an integration test with it.** This is how
VIMO earns trust.

Our rule, by design:

> We mock the **external API** (Facebook Graph, Shopify, GitHub, …) and **never** VIMO's own
> logic. The credential store, connector registry, and adapters run for real against an
> in-memory SQLite database.

Examples to copy from:

- `packages/backend/src/tests/connectionSocialAccounts.test.ts` — Instagram account verification
  and publish, with the Meta Graph API mocked.
- `packages/backend/src/tests/connectionPackMarketplace.test.ts` — `discoverPack` (discover +
  validate) and `PackAdapter` sync/health, with the provider APIs mocked.

Run them with:

```bash
npm run test --workspace=packages/backend
npm run test --workspace=packages/backend -- connection   # just the connection layer
```

The suite uses `src/tests/setup.ts` to spin up an isolated `:memory:` database and a test
encryption key, so it never touches your real `./data/vimo.db`.

## Extending VIMO (the fun part)

Want to add a connector, a Pack, or an intelligence source? It's ~50 lines. Read
**[docs/EXTENDING_VIMO.md](docs/EXTENDING_VIMO.md)** — it has a full copy-paste example
(Product Hunt) covering the preset, the discover fetcher, and the `PackAdapter`, plus how to test
it the same way we test everything else.

Good first issues:

- **Add a connector preset** — wire up a new platform in `packages/backend/src/connectors/presets/`.
- **Add a `PackAdapter`** — a new intelligence source in `packages/backend/src/services/packIntegrations.ts`.
- **Improve error messages** — replace silent catches with real, token-free feedback.
- **Add tests** — every connection path deserves an integration test.
- **Improve docs** — fix typos, clarify sections, add examples.

## Label legend (one-liners)

We keep labels small and meaningful so newcomers can self-select work:

- `good first issue` — small, well-scoped, mentored; the best on-ramp for new contributors.
- `bug` — something is broken or behaves unexpectedly.
- `enhancement` — a new feature, connector, or pack.
- `docs` — documentation-only change (README, docs, comments).
- `security` — relates to secrets, auth, or the threat model (see [SECURITY.md](SECURITY.md)).

## Pull Request Process

1. Fork the repo and create a branch from `main`.
2. **Add a changeset** for any user- or contributor-facing change:
    `npm run changeset` (see the legend in [.changeset/README.md](.changeset/README.md)).
   This drives versioning and the changelog — never bump a version by hand.
3. Run `npm run lint` (both packages) and `npm run test` — CI also builds the app
   (`tsc` + `vite build`), so a green pipeline means it actually compiles and bundles.
4. If your change affects the UI, include a screenshot in the PR.
5. Keep PRs focused — one feature or fix per PR.
6. If you changed setup, config, or a connection, update the README and
   [docs/EXTENDING_VIMO.md](docs/EXTENDING_VIMO.md) as needed.

## Code Style

- TypeScript strict mode — no `any` unless absolutely necessary.
- React: functional components, hooks, Zustand for state.
- Tailwind CSS for styling — avoid inline styles and CSS variables.
- Backend: Fastify route handlers with explicit types.
- No silent catch blocks — every error should log or show user feedback.
- **Never log secrets or tokens.** Errors returned to clients are sanitized.

## Security

Found a vulnerability? **Do not open a public issue.** See [SECURITY.md](SECURITY.md) for the
private reporting channel and our honest inventory of what VIMO stores and why.

## Reporting Bugs

Open an issue with:

- Steps to reproduce
- What you expected to happen
- What actually happened
- Your browser, OS, and Node.js version (`node --version`)

## Feature Requests

Open an issue with the `enhancement` label. Tell us what you're trying to achieve and how VIMO can
help. We prioritize features that solve real problems for real users.

## Questions?

Join our [Discord](https://discord.gg/vimo) or open a Discussion on GitHub.
