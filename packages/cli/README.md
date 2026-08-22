# @vimo-oss/cli — one-command VIMO

VIMO is a marketing-operations platform with its own AI. This package is a thin
launcher that installs and runs VIMO locally so anyone can start it without
knowing how the pieces fit together. No git, no build tools, no API keys.

## Quick start

```bash
npm i -g @vimo-oss/cli
vimo
```

On Windows you can type `VIMO` (any case) in cmd or PowerShell; on macOS and
Linux both `vimo` and `VIMO` work after install.

On first run it downloads VIMO, installs its components, builds the app, starts
it on a free port, and opens your browser. First run takes a few minutes;
every later run is fast. Press `Ctrl+C` to stop.

## From this repo (developers)

```bash
npm install
cd packages/cli && npm link
vimo
```

Or run the script directly: `node packages/cli/bin/vimo.mjs`. When run inside a
VIMO checkout, it uses that checkout instead of downloading one — but note it
starts the **built production app** (`npm run build:app` first if needed), not
the dev servers. Use `npm run dev` at the repo root for development with hot reload.

## Flags

| Flag         | What it does                                                       |
| ------------ | ------------------------------------------------------------------ |
| `--repo`     | Use a specific VIMO checkout instead of auto-detecting             |
| `--port`     | Preferred port (default 3000; busy ports are skipped automatically) |
| `--no-open`  | Start without opening a browser                                    |
| `--reset`    | Reinstall dependencies and rebuild from scratch                    |
| `--update`   | Refresh VIMO to the latest version (keeps your data and settings)  |
| `--doctor`   | Check whether this computer is ready to run VIMO                   |
| `--version`  | Print the version                                                  |
| `--help`     | Show usage                                                         |

## Where does VIMO live?

1. `--repo <path>` if given,
2. `VIMO_HOME` environment variable if set,
3. the current directory, when it is a VIMO checkout,
4. otherwise `~/.vimo` (downloaded automatically on first run).

Your content, settings, and connected accounts live in `<install>/data`
(SQLite). `--update` preserves them.

## Requirements

- Node.js 20–22 LTS ("Current" versions may need extra build tools for native modules).
- Internet access for the first download.
- Nothing else — no git, no Docker, no compilers on supported Node versions.
