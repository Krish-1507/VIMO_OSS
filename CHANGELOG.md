# Changelog

All notable changes to VIMO are documented here.

This file is maintained automatically by [Changesets](https://github.com/changesets/changesets).
Do not edit released sections by hand — add a changeset instead:

```bash
npm run changeset
```

The release workflow (`.github/workflows/release.yml`) consumes pending changesets on merge to
`main`, opens a "Version Packages" PR, and appends the new entries below.

## 2.0.0

Initial public release of VIMO — VIbe Marketing Operations.

- Fastify + React + SQLite monorepo (`packages/backend`, `packages/frontend`, `packages/shared`)
- Connector Hub and Pack Marketplace with install/uninstall/connect/disconnect
- Marketing Director agent with scheduled daily and weekly runs
- Approval queue, scheduler, viral studio, engagement pipeline, and analytics
- Demo Mode — explore VIMO with no API keys and no accounts
