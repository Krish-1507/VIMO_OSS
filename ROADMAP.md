# Roadmap

VIMO is an open-source, community-driven project. This roadmap is a living
document — it reflects what we're building next and where we'd love help. It is
**intentionally honest**: items are marked by the same readiness language we use
everywhere else (`Ready` · `In progress` · `Planned` · `Idea`).

> Want to shape the roadmap? Open a [Discussion](https://github.com/Krish-1507/VIMO_OSS/discussions)
> or a feature request. The best contributions start there.

## Shipped

- **Real publishing for YouTube, TikTok, Pinterest.** Resumable YouTube uploads,
  TikTok Content Posting API (polled, SELF_ONLY uploads), Pinterest v5 pins with
  board resolution. Instagram/Facebook/LinkedIn/X were already live.
- **Multi-account per platform.** Connect several Instagram/LinkedIn/X accounts
  and pick the publishing account per post ("Publish as" in the Scheduler).
- **Autopilot guardrails.** Daily post cap + daily AI spend cap, enforced in the
  content-generation and scheduling phases, plus a "Run next week now" control.
- **Webhooks.** Event delivery (post published/failed, test fires), HMAC-signed
  payloads, delivery history, and a retry queue with exponential backoff.
- **Approval Queue batching by campaign.** Approve every pending post of a
  campaign in one click; posts group by campaign in the Approvals UI.
- **Connector Hub search + filters.** Search by name/description and filter by
  category and readiness (Ready / Connect only / Coming soon).
- **Growth-loop analytics.** `analyzeTopPerformingContent` ranks published posts
  by real engagement data and feeds growth insights.
- **Tool router built-in dispatch.** All whitelisted tools route through the
  platform handler registry — no more "not yet implemented" stubs.
- **Analytics CSV export.** Download post performance for the selected range and
  brand.
- **Email notifications.** Dependency-free SMTP client (plain/STARTTLS/implicit
  TLS), settings UI with test send, best-effort mirrors of in-app notifications.
- **Plugin API.** Register third-party connectors with actions, install them as
  real connectors, and run their actions with credential/param templating.
- **Automated releases.** Changesets drive versioning + changelog; CI verifies
  (lint, build, banned words, silent catches), tests with coverage, and runs a
  Playwright smoke that boots the app, runs the Director, and checks webhooks,
  approvals, and CSV export.
- **Stay-logged-in browser sessions.** Persistent Chromium profiles (one per
  account) with approval-gated clicks/types and `browser_read` / `browser_act`
  assistant tools.
- **Login-free channel research.** Internal AgentReach readers for Reddit,
  YouTube transcripts, GitHub, RSS, and single X posts, exposed as the
  `research_channel` assistant tool.

## Now (next release)

- **More `Ready` connectors.** Move remaining publish handlers from _Connect
  only_ → _Ready_.
- **Connector test coverage.** Every connection path ships with an integration
  test.

## Next

- **Local model parity.** First-class Ollama support for fully offline runs
  (generation + embeddings) — embeddings are wired; surface them in Settings.
- **Approval Queue depth.** Deeper per-campaign controls — schedules, bulk edits, and
  campaign-level notifications (batching by campaign already ships).
- **Connector Hub polish.** Popularity sort, richer metadata.

## Later / Ideas

- **Multi-user mode (deferred).** Real auth layer with per-role permissions,
  shared brands, and invitations. VIMO is intentionally single-user today —
  the unenforced roster UI was removed; see [SECURITY.md](SECURITY.md).
- **Visual connector builder.** A UI to scaffold a `PackAdapter` without leaving
  VIMO.
- **Plugin API, richer.** Auth flows beyond API keys, webhook-triggered actions,
  and a plugin marketplace.
- **Scheduled analytics digests.** Periodic PDF/CSV digests of brand
  performance to email.
- **Webhook retry observability.** Admin view of the retry queue with manual
  re-fire (automatic retries with exponential backoff already ship).

## How this maps to "good first issues"

The items above tagged **Ready to start** are great first contributions. Look
for the [`good first issue`](https://github.com/Krish-1507/VIMO_OSS/labels/good%20first%20issue)
label on GitHub for small, well-scoped tasks pulled from this roadmap.

## Platform notes

- **TikTok publishing** requires a TikTok **developer account** and an approved
  app with the `video.publish` (Content Posting API) scope. Uploads are created
  as **private (SELF_ONLY)** and must be made public in the TikTok app — the
  whitelist/approval flow is managed by TikTok, not VIMO.
- **YouTube** uses resumable uploads against the `youtube.upload` scope; videos
  are private until you publish them in YouTube Studio.
