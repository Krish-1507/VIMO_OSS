#!/usr/bin/env node
/**
 * VIMO — one-command start.
 *
 * Wrapper around the VIMO monorepo so a non-technical person can go from
 * nothing to a running VIMO with a single command:
 *
 *   npm i -g vimo
 *   vimo
 *
 * What it does:
 *  1. Finds the VIMO source (cwd if you're in the repo, ~/.vimo otherwise).
 *  2. Installs dependencies on first run (and copies .env from the example).
 *  3. Starts the dev servers (frontend + backend) and opens your browser.
 *  4. Stops everything cleanly when you press Ctrl+C.
 *
 * Flags:
 *   --repo <path>   Use a specific VIMO checkout instead of auto-detecting.
 *   --port <n>      Frontend port to wait for and open (default 5173).
 *   --no-open       Start without opening a browser.
 *   --reset         Reinstall dependencies from scratch.
 *   --version       Print the version.
 *   --help          Show this help.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/Krish-1507/VIMO_OSS.git';
const DEFAULT_PORT = 5173;
const START_TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const CLI_VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

if (args.includes('--version')) {
  console.log(`vimo ${CLI_VERSION}`);
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`vimo ${CLI_VERSION}

Usage: vimo [flags]

Starts VIMO locally and opens it in your browser.

Flags:
  --repo <path>   Use a specific VIMO checkout.
  --port <n>      Frontend port to wait for and open (default ${DEFAULT_PORT}).
  --no-open       Start without opening a browser.
  --reset         Reinstall dependencies from scratch.
  --version       Print the version.
  --help          Show this help.

First run installs VIMO and its dependencies automatically.`);
  process.exit(0);
}

const port = Number(getArg('--port') || DEFAULT_PORT);
const noOpen = args.includes('--no-open');
const doReset = args.includes('--reset');

function log(msg) {
  console.log(`\x1b[36m[vimo]\x1b[0m ${msg}`);
}

function warn(msg) {
  console.warn(`\x1b[33m[vimo]\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31m[vimo] ${msg}\x1b[0m`);
  process.exit(1);
}

function isWindows() {
  return process.platform === 'win32';
}

function npmCmd() {
  return isWindows() ? 'npm.cmd' : 'npm';
}

function runSync(cmd, args, cwd, label) {
  log(`${label}`);
  try {
    execSync(`"${cmd}" ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true });
  } catch {
    fail(`${label} failed. Fix the error above and run \`vimo\` again.`);
  }
}

function isVimoRepo(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg.name === 'vimo' && Array.isArray(pkg.workspaces) && fs.existsSync(path.join(dir, 'packages'));
  } catch {
    return false;
  }
}

function resolveRepo() {
  const fromFlag = getArg('--repo');
  if (fromFlag) {
    const p = path.resolve(fromFlag);
    if (!isVimoRepo(p)) fail(`--repo ${fromFlag} is not a VIMO checkout.`);
    return p;
  }
  if (process.env.VIMO_HOME) {
    const p = path.resolve(process.env.VIMO_HOME);
    if (!isVimoRepo(p)) fail(`VIMO_HOME (${process.env.VIMO_HOME}) is not a VIMO checkout.`);
    return p;
  }
  if (isVimoRepo(process.cwd())) {
    log(`Using the VIMO repo in ${process.cwd()}`);
    return process.cwd();
  }
  const home = path.join(os.homedir(), '.vimo');
  if (!fs.existsSync(home)) {
    log(`First run — downloading VIMO to ${home} (takes a minute)...`);
    runSync('git', ['clone', '--depth', '1', REPO_URL, home], os.homedir(), 'Downloading VIMO...');
  }
  if (!isVimoRepo(home)) fail(`${home} exists but is not a VIMO checkout. Move it away and run \`vimo\` again.`);
  return home;
}

function ensureEnv(repo) {
  const envFile = path.join(repo, '.env');
  const example = path.join(repo, '.env.example');
  if (!fs.existsSync(envFile) && fs.existsSync(example)) {
    fs.copyFileSync(example, envFile);
    log('Created .env from the example (defaults are fine for local use).');
  }
}

function ensureDeps(repo) {
  const nodeModules = path.join(repo, 'node_modules');
  if (doReset) {
    runSync(npmCmd(), ['install'], repo, 'Installing dependencies...');
    return;
  }
  if (!fs.existsSync(nodeModules)) {
    runSync(npmCmd(), ['install'], repo, 'Installing dependencies (first run only)...');
  }
}

async function waitForServer(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok || res.status === 200 || res.status === 404) {
        return true;
      }
    } catch {
      // not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

function openBrowser(url) {
  try {
    if (isWindows()) {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true });
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    }
  } catch (err) {
    warn(`Could not open a browser automatically. Open ${url} yourself.`);
  }
}

function killTree(pid) {
  try {
    if (isWindows()) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch {
    // already gone
  }
}

async function main() {
  const repo = resolveRepo();
  ensureEnv(repo);
  ensureDeps(repo);

  const url = `http://localhost:${port}`;
  log(`Starting VIMO (frontend: ${url}, backend: http://localhost:3000)...`);
  log('This opens the app in your browser once it is ready. Press Ctrl+C to stop.');

  const child = spawn(npmCmd(), ['run', 'dev'], {
    cwd: repo,
    stdio: 'inherit',
    shell: isWindows(),
    detached: !isWindows(),
  });

  let exiting = false;
  function shutdown(signal) {
    if (exiting) return;
    exiting = true;
    if (signal) log(`Received ${signal} — stopping VIMO...`);
    if (child && child.pid) killTree(child.pid);
    setTimeout(() => process.exit(0), 400);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  child.on('exit', (code) => {
    if (!exiting) {
      exiting = true;
      process.exit(code ?? 0);
    }
  });

  const up = await waitForServer(url, 'VIMO');
  if (!up) {
    warn(`VIMO did not answer on ${url} in time. If the terminal above shows an error, fix it and run \`vimo\` again.`);
    return;
  }

  log('VIMO is ready!');
  if (noOpen) {
    log(`Open ${url} in your browser.`);
  } else {
    log(`Opening ${url} in your browser...`);
    openBrowser(url);
  }
}

main();
