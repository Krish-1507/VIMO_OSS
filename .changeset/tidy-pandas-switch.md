---
"@vimo/backend": minor
---

Stay-logged-in browser sessions plus internal channel research.

- **Browser sessions**: persistent Chromium profiles per session key — log in once in a visible window, the agent reuses it headlessly. Reads need no approval; every click/type creates (or requires) a human-approved approval request. New `/api/browser-sessions/*` routes and `browser_read` / `browser_act` assistant tools.
- **Research channels**: VIMO's internal AgentReach — Reddit search/threads, YouTube transcripts, GitHub repos/readmes, RSS feeds, single X posts with honest login-wall errors. New `research_channel` assistant tool.
