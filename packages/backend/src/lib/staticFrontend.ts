import fs from 'fs';
import path from 'path';

/**
 * Locate the built frontend (`packages/frontend/dist`) from any starting point.
 *
 * The backend can be started three ways:
 *  - dev:        ts-node src/index.ts          (__dirname = packages/backend/src)
 *  - built:      node dist/backend/src/index.js(__dirname = packages/backend/dist/backend/src)
 *  - any cwd:    started by the CLI from an arbitrary working directory
 *
 * Rather than hardcoding a fragile number of `..` segments, walk up from both
 * __dirname and process.cwd() until we find a checkout containing the built
 * frontend. Returns null when the frontend hasn't been built yet, which lets
 * the server keep running API-only (the normal dev setup).
 */
function* walkUp(start: string): Generator<string> {
  let current = path.resolve(start);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export function findFrontendDist(): string | null {
  const override = process.env.FRONTEND_DIST_PATH;
  if (override) {
    const resolved = path.resolve(override);
    if (fs.existsSync(path.join(resolved, 'index.html'))) return resolved;
    console.warn(
      `[vimo] FRONTEND_DIST_PATH=${override} does not contain index.html — ignoring.`,
    );
  }

  const starts = [__dirname, process.cwd()];
  for (const start of starts) {
    for (const dir of walkUp(start)) {
      const candidate = path.join(dir, 'packages', 'frontend', 'dist');
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Find the repository root (the folder whose package.json is named "vimo").
 * Used for resolving `.env` regardless of how/where the server was started.
 */
export function findRepoRoot(): string | null {
  const starts = [__dirname, process.cwd()];
  for (const start of starts) {
    for (const dir of walkUp(start)) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        );
        if (pkg.name === 'vimo') return dir;
      } catch {
        // not a package.json we care about — keep walking
      }
    }
  }
  return null;
}
