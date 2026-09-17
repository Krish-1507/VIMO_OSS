#!/usr/bin/env node
/**
 * Copy skill definitions next to the compiled loader.
 *
 * tsc emits .js but never .md, so without this step the production dist
 * (and therefore Docker + the `vimo` launcher) would boot with zero skills.
 * Runs as part of `npm run build` in packages/backend — plain node, no deps,
 * Windows-safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src', 'skills');
const dest = path.join(here, '..', 'dist', 'backend', 'src', 'skills');

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of fs.readdirSync(src)) {
  if (!file.endsWith('.skill.md')) continue;
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
  copied++;
}
console.log(`[skills] copied ${copied} skill definition(s) to dist`);
