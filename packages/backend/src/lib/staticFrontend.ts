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
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'vimo') return dir;
      } catch (err) {
        // Malformed package.json above the app — not ours to fix, keep walking.
        console.warn('[vimo] skipping unreadable package.json during root search:', err);
      }
    }
  }
  return null;
}
