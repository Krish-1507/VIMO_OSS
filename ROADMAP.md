# Roadmap

VIMO is an open-source, community-driven project. This roadmap is a living
document — it reflects what we're building next and where we'd love help. It is
**intentionally honest**: items are marked by the same readiness language we use
everywhere else (`Ready` · `In progress` · `Planned` · `Idea`).

> Want to shape the roadmap? Open a [Discussion](https://github.com/yourusername/vimo/discussions)
> or a feature request. The best contributions start there.

## Now (next release)

- **Automated releases.** Changesets now drive versioning + changelog, and CI
  builds the app (not just type-checks). See [CONTRIBUTING.md](CONTRIBUTING.md).
- **More `Ready` connectors.** Move publish handlers from _Connect only_ →
  _Ready_ (YouTube, TikTok, Pinterest).
- **Connector test coverage.** Every connection path ships with an integration
  test.

## Next

- **Multi-account per platform.** Manage several Instagram/LinkedIn/X accounts
  from one VIMO brand.
- **Local model parity.** First-class Ollama support for fully offline runs
  (generation + embeddings).
- **Approval Queue batching by campaign.** Group pending actions into campaigns
  you approve in one click.
- **Connector Hub search + filters.** Find a pack by category, readiness, or
  popularity.

## Later / Ideas

- **Team mode.** Roles, shared brands, and a real auth layer (currently
  single-user, localhost-first — see [SECURITY.md](SECURITY.md)).
- **Visual connector builder.** A UI to scaffold a `PackAdapter` without leaving
  VIMO.
- **Plugin API.** Let third parties ship connectors as external packages.
- **Analytics exports.** Scheduled PDF/CSV digests of brand performance.

## How this maps to "good first issues"

The items above tagged **Ready to start** are great first contributions. Look
for the [`good first issue`](https://github.com/yourusername/vimo/labels/good%20first%20issue)
label on GitHub for small, well-scoped tasks pulled from this roadmap.
