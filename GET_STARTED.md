# Get Started with VIMO — Zero Keys Needed

Welcome! You can use VIMO without ever touching a developer setting or pasting an API key. Here's the honest, plain-language path.

## Explore instantly with the Demo

The fastest way to see VIMO in action is the built-in **Demo** (clearly labeled "Demo"). It's a fully working sample experience — no accounts, no sign-ups, no keys. Just click it and start clicking around. Perfect for a first look.

## Connect with one click (no keys)

When you're ready for real use, VIMO connects your accounts **on your behalf**:

- **Managed providers** — GitHub, Notion, Canva, LinkedIn, and X — connect with **one click**. VIMO handles the connection for you. You never create an app, copy a secret, or paste anything. Just click "Connect" and approve when your account asks you to log in. That's it.
- **Other platforms** — many other platforms can be connected by pasting the key that's shown right in that platform's own settings. VIMO tells you exactly where to find it in plain language. No developer jargon required.

You stay in control the whole time. VIMO only does what you approve.

## Quick start

### One-command start (no technical knowledge needed)

```bash
npm i -g vimo-oss
vimo
```

That's it. VIMO downloads, builds, starts, and opens in your browser. No git,
no Docker, no keys. On Windows type `VIMO` or `vimo`; on macOS and Linux both
work too. If your computer has **Ollama** installed, onboarding detects it and
offers **"Use free local AI"** with one click — no account, no key, nothing
leaves your machine. Don't have Ollama? The onboarding card links you to the
free installer and checks again automatically after you've installed it.
First run takes a few minutes; later starts are fast. Press `Ctrl+C` to stop.

Handy extras: `vimo doctor` checks your computer is ready; `vimo --update`
updates the launcher and then the app while keeping all your data. If you ever
suspect you're on an old copy: `npm i -g vimo-oss@latest`, then `vimo --update`,
then confirm in Settings → About.

### Running from the source code (developers)

1. **Run the app** and open it in your browser (`npm install`, then `npm run dev`).
2. Click **"Try Demo"** to explore instantly, **or** connect an account with one click.
3. You're done. VIMO writes, schedules, and analyzes your content while you stay in control.

No credit card needed to start. Connect more accounts whenever you like from the Connector Hub.

## Just tell VIMO what you want

After setup, you don't need to learn the app. Click **Ask VIMO** (sidebar, dashboard hero, or `Cmd/Ctrl+K`) and type one sentence: "Grow my Instagram this month", "write a post for tomorrow 9am", "why did engagement drop?" The agent does the work across your connected accounts and brand — writing, scheduling, analyzing — and shows you every step it takes.

## Want to verify before trusting it?

- **Automated tests** — `npm test` runs the full suite (**241 backend tests** across 31 files, 9
  frontend tests). The Pack Marketplace + Social Accounts flows are covered by
  `connectorsMarketplaceRoutes.test.ts` on a real Fastify app with a real session
  token + CSRF token. A Playwright smoke boots the real app, runs the Marketing
  Director, and checks webhooks, approvals, and CSV export end-to-end. See
  [docs/CONNECTORS_VERIFICATION.md](docs/CONNECTORS_VERIFICATION.md).
- **Manual smoke-tests** — the same doc has copy-pasteable `fetch` snippets you can
  run from the browser console to verify install, uninstall, disconnect, and
  app-password behavior end-to-end against a running dev server.
