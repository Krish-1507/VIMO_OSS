# vimo — one-command VIMO

VIMO is a marketing-operations platform with its own AI. This package is a thin
wrapper that runs the VIMO monorepo locally so anyone can start it without
knowing how the pieces fit together.

## Quick start

```bash
npm i -g vimo
vimo
```

On first run it downloads VIMO, installs dependencies, and starts the app.
Your browser opens automatically.

## From this repo (developers)

```bash
npm install
npm link
vimo
```

Or run the script directly: `node packages/cli/bin/vimo.mjs`.

## Flags

| Flag         | What it does                                          |
| ------------ | ----------------------------------------------------- |
| `--repo`     | Use a specific VIMO checkout instead of auto-detecting |
| `--port`     | Frontend port to wait for / open (default 5173)        |
| `--no-open`  | Start without opening a browser                        |
| `--reset`    | Reinstall dependencies from scratch                    |
| `--version`  | Print the version                                      |
| `--help`     | Show usage                                             |

## Where does VIMO live?

1. `--repo <path>` if given,
2. `$VIMO_HOME` if set,
3. the current directory, if you are inside a VIMO checkout,
4. otherwise `~/.vimo` (created automatically by cloning the repo).

## Stopping

Press `Ctrl+C` in the terminal. All VIMO processes are stopped with it.

## Notes

- Requires Node.js 20 or newer.
- The first run downloads a few hundred MB of dependencies; later starts are
  fast.
- VIMO runs 100% on your machine — your data and keys never leave it.
