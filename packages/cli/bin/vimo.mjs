#!/usr/bin/env node
/**
 * VIMO — one-command launcher.
 *
 * Built for people who have a brand to grow, not a DevOps team. From nothing
 * to a running VIMO in your browser:
 *
 *   npm i -g @vimo-oss/cli
 *   vimo          (or: VIMO)
 *
 * What it does:
 *  1. Checks Node.js (>=20) and explains how to get it if missing.
 *  2. Finds the VIMO app code (cwd if you're in the repo, ~/.vimo otherwise).
 *     No git required — it downloads a ready-made archive.
 *  3. First run: downloads, installs dependencies and builds (~a few minutes,
 *     automatic). Later runs start fast.
 *  4. Starts VIMO on a free port and opens your browser.
 *  5. Press Ctrl+C to stop everything cleanly.
 *
 * Flags:
 *   --repo <path>   Use a specific VIMO checkout instead of auto-detecting.
 *   --port <n>      Preferred port to serve on (default 3000; busy ports are skipped).
 *   --no-open       Start without opening a browser.
 *   --reset         Reinstall dependencies and rebuild from scratch.
 *   --update        Refresh VIMO to the latest version (your data is kept).
 *   --doctor        Check this computer is ready to run VIMO.
 *   --version       Print the version.
 *   --help          Show this help.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_TARBALL_URL = 'https://github.com/Krish-1507/VIMO_OSS/archive/refs/heads/main.tar.gz';
const TARBALL_ROOT_DIR = 'VIMO_OSS-main'; // top-level folder inside the archive
const DEFAULT_PORT = 3000;
const PORT_ATTEMPTS = 50;
const HEALTH_TIMEOUT_MS = 120_000;
const MIN_NODE_MAJOR = 20;

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

let pkgVersion = '0.0.0';
try {
  pkgVersion = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).version;
} catch {
  // keep fallback version
}

/* -------------------------------------------------------------------------- */
/* Output helpers                                                              */
/* -------------------------------------------------------------------------- */

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Colors are for humans looking at a terminal. When output is piped to a file
// or the user asked for no color, fall back to clean plain text.
const colorEnabled =
  !process.env.NO_COLOR && (process.stdout.isTTY || process.stderr.isTTY);
function paint(code, text) {
  return colorEnabled ? `${code}${text}${RESET}` : text;
}

function log(msg) {
  console.log(`${paint(CYAN, '[vimo]')} ${msg}`);
}
function ok(msg) {
  console.log(`${paint(GREEN, '[vimo]')} ${msg}`);
}
function warn(msg) {
  console.warn(`${paint(YELLOW, '[vimo]')} ${msg}`);
}
function fail(msg) {
  console.error(`\n${paint(RED, '[vimo] ' + msg)}`);
  process.exit(1);
}

/**
 * Startup banner.
 *
 * "ANSI Shadow" block letterforms spelling V I M O with a per-line
 * aqua → deep-blue gradient. Block/box glyphs (█ ╗ ║ ╚ ─ …) render correctly
 * in Windows Terminal, VS Code, iTerm2 and classic conhost (Node writes them
 * through WriteConsoleW), so they are safe everywhere this CLI runs.
 */
function printBanner() {
  const LOGO = [
    '██╗   ██╗ ██╗ ███╗   ███╗  ██████╗ ',
    '██║   ██║ ██║████╗ ████║ ██╔═══██╗',
    '██║   ██║ ██║██╔████╔██║ ██║   ██║',
    '╚██╗ ██╔╝ ██║██║╚██╔╝██║ ██║   ██║',
    ' ╚████╔╝  ██║██║ ╚═╝ ██║ ╚██████╔╝',
    '  ╚═══╝   ╚═╝╚═╝     ╚═╝  ╚═════╝ ',
  ];
  // 256-color ramp: bright aqua fading into deep blue, top to bottom.
  const GRADIENT = [87, 81, 75, 69, 62, 56];

  console.log('');
  LOGO.forEach((line, i) => {
    console.log(' ' + paint(`\x1b[38;5;${GRADIENT[i]}m`, line));
  });
  console.log('');
  console.log(
    `  ${paint(BOLD + GREEN, 'VIMO OSS')}  ${paint(DIM, '·  Vibe Marketing Operations  ·  v' + pkgVersion)}${colorEnabled ? RESET : ''}`,
  );
  console.log(
    `  ${paint(DIM, 'Your brand, on autopilot — local-first, open-source.')}`,
  );
  console.log('');
}

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

if (args.includes('--version')) {
  console.log(`vimo ${pkgVersion}`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`vimo ${pkgVersion}

Starts VIMO locally and opens it in your browser.

Usage: vimo [flags]

Flags:
  --repo <path>   Use a specific VIMO checkout.
  --port <n>      Preferred port (default ${DEFAULT_PORT}; busy ports are skipped automatically).
  --no-open       Start without opening a browser.
  --reset         Reinstall dependencies and rebuild from scratch.
  --update        Refresh VIMO to the latest version (your data is kept).
  --doctor        Check whether this computer is ready to run VIMO.
  --version       Print the version.
  --help          Show this help.

First run downloads and builds VIMO automatically — no other tools needed.`);
  process.exit(0);
}

const portBase = Number(getArg('--port') || DEFAULT_PORT);
const noOpen = args.includes('--no-open');
const doReset = args.includes('--reset');
const doUpdate = args.includes('--update');

/* -------------------------------------------------------------------------- */
/* Environment checks                                                          */
/* -------------------------------------------------------------------------- */

function nodeMajor() {
  return Number(process.versions.node.split('.')[0]);
}

function checkNode() {
  const major = nodeMajor();
  if (major < MIN_NODE_MAJOR) {
    fail(
      `VIMO needs Node.js version ${MIN_NODE_MAJOR} or newer, but this computer has ` +
        `${process.versions.node}.\n` +
        `Please install the current Node.js from https://nodejs.org/en/download ` +
        `(choose the "LTS" version), then run \`vimo\` again.`,
    );
  }
  // Very fresh Node versions may lack prebuilt binaries for some of VIMO's
  // native modules, which can make the first install slow or fail.
  if (major > 22) {
    warn(
      `You are using Node.js ${process.versions.node}. VIMO works best on Node 20–22 ` +
        `(the "LTS" release). If the install below fails, switching to LTS fixes it.`,
    );
  }
}

function isWindows() {
  return process.platform === 'win32';
}

function npmCmd() {
  return isWindows() ? 'npm.cmd' : 'npm';
}

/** Locate the OS "tar" tool. Present by default on Windows 10+, macOS, Linux. */
function findTar() {
  if (isWindows()) {
    const sysTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(sysTar)) return sysTar;
    return null;
  }
  const res = spawnSync('tar', ['--version'], { stdio: 'ignore' });
  return res.error ? null : 'tar';
}

function runLive(cmd, cmdArgs, opts, label) {
  log(label);
  // shell:true is REQUIRED on Windows for .cmd shims like npm.cmd: since
  // Node 18.20/20.12 (CVE-2024-27980) spawning a .cmd/.bat without a shell
  // throws EINVAL, which used to abort the first-run installer instantly.
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: isWindows(), ...opts });
  if (res.error) {
    console.error(`[vimo] Could not start ${cmd}: ${res.error.message}`);
  }
  if (res.status !== 0 || res.error) {
    const step = label.replace(/…$/, '').replace(/\.\.\.$/, '');
    fail(`${step} didn't finish. Check the messages above, then run \`vimo\` again.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Repo resolution & download                                                  */
/* -------------------------------------------------------------------------- */

function isVimoRepo(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return (
      pkg.name === 'vimo' &&
      Array.isArray(pkg.workspaces) &&
      fs.existsSync(path.join(dir, 'packages'))
    );
  } catch {
    return false;
  }
}

function homeDir() {
  return path.join(os.homedir(), '.vimo');
}

async function downloadFile(url, dest) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    fail(
      `Couldn't reach the internet to download VIMO (${err.message}).\n` +
        'Check your connection and run `vimo` again.',
    );
  }
  if (!res.ok || !res.body) {
    fail(`Download failed (HTTP ${res.status}). Please try again in a minute.`);
  }
  const total = Number(res.headers.get('content-length') || 0);
  let received = 0;
  let lastPct = -10;

  const out = fs.createWriteStream(dest);
  const drained = () =>
    new Promise((resolve) => {
      out.once('drain', resolve);
    });
  for await (const chunk of res.body) {
    received += chunk.length;
    if (!out.write(chunk)) await drained();
    if (total > 0) {
      const pct = Math.floor((received / total) * 100);
      if (pct >= lastPct + 10 && pct < 100) {
        lastPct = pct;
        log(`Downloading VIMO… ${pct}%`);
      }
    }
  }
  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on('error', reject);
  });
  log('Downloading VIMO… done.');
}

function rmRf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Extract the archive into destDir; returns path to the extracted repo folder. */
function extractArchive(archivePath, destDir, tarBin) {
  fs.mkdirSync(destDir, { recursive: true });
  const res = spawnSync(tarBin, ['-xzf', archivePath, '-C', destDir], { stdio: 'ignore' });
  if (res.status !== 0 || res.error) {
    fail("Couldn't unpack the downloaded files. Run `vimo` again — if it keeps failing, run `vimo doctor`.");
  }
  const extracted = path.join(destDir, TARBALL_ROOT_DIR);
  if (!isVimoRepo(extracted)) {
    fail('The downloaded package looks damaged. Delete it and run `vimo` again.');
  }
  return extracted;
}

/**
 * Download the latest code into targetDir. If oldRepo exists, `.env` and the
 * `data/` folder (your content, settings and connected accounts) are carried over.
 */
async function downloadLatest(targetDir, oldRepo) {
  const home = path.dirname(targetDir); // parent used for temp artifacts
  const marker = `${targetDir}.incomplete`;
  const staging = path.join(home, `.vimo-staging-${Date.now()}`);
  const archive = path.join(home, `.vimo-download-${Date.now()}.tar.gz`);

  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(marker, String(Date.now()));
  try {
    await downloadFile(REPO_TARBALL_URL, archive);
    const extracted = extractArchive(archive, staging, findTar());

    if (oldRepo && fs.existsSync(oldRepo)) {
      for (const keep of ['.env', 'data']) {
        const src = path.join(oldRepo, keep);
        const dst = path.join(extracted, keep);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dst, { recursive: true, force: true });
        }
      }
    }

    rmRf(targetDir);
    fs.renameSync(extracted, targetDir);
    ok('VIMO downloaded.');
  } finally {
    try {
      fs.rmSync(staging, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(archive, { force: true });
    } catch {}
    try {
      fs.rmSync(marker, { force: true });
    } catch {}
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
    log(`Using the VIMO copy in ${process.cwd()}`);
    return process.cwd();
  }
  const home = homeDir();
  const marker = `${home}.incomplete`;
  const staleMarker = fs.existsSync(marker) && !fs.existsSync(home);
  if (staleMarker) {
    // A previous download was interrupted before anything was installed.
    try {
      fs.rmSync(marker, { force: true });
    } catch {}
  }
  return home; // may not exist yet — ensureRepo handles it
}

async function ensureRepo(repo) {
  if (doUpdate && repo === homeDir()) {
    log('Checking for a newer version of VIMO…');
    await downloadLatest(repo, repo);
    return;
  }
  if (fs.existsSync(repo)) {
    if (!isVimoRepo(repo)) {
      fail(
        `${repo} already exists but isn't a VIMO installation.\n` +
          'If you don\'t recognize it, rename or delete that folder and run `vimo` again.',
      );
    }
    return;
  }
  log('Welcome! Setting up VIMO on this computer (first run only).');
  await downloadLatest(repo, null);
}

/* -------------------------------------------------------------------------- */
/* Configuration (.env)                                                        */
/* -------------------------------------------------------------------------- */

function upsertEnvLine(content, key, value) {
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  return `${content.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

function ensureEnv(repo, managedHome) {
  const envFile = path.join(repo, '.env');
  const example = path.join(repo, '.env.example');
  let content = '';
  let created = false;
  if (fs.existsSync(envFile)) {
    content = fs.readFileSync(envFile, 'utf8');
  } else if (fs.existsSync(example)) {
    content = fs.readFileSync(example, 'utf8');
    created = true;
  }

  const keyRe = /^#?\s*ENCRYPTION_KEY=(.*)$/m;
  const currentKey = (content.match(keyRe) || [])[1] || '';
  const keyLooksBad =
    currentKey.trim().length < 32 ||
    currentKey.includes('your-') ||
    currentKey.includes('change-me') ||
    currentKey.includes('example');
  if (keyLooksBad) {
    content = upsertEnvLine(content, 'ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
    created = true;
  }

  // Only the launcher-managed install (~/.vimo) is forced into production mode;
  // developers pointing --repo at their own checkout keep their environment.
  if (managedHome) {
    content = upsertEnvLine(content, 'NODE_ENV', 'production');
  }
  content = upsertEnvLine(content, 'DB_PATH', './data/vimo.db');

  fs.writeFileSync(envFile, content);
  if (created) log('Created settings file with secure defaults.');
}

/* -------------------------------------------------------------------------- */
/* Dependencies & build                                                        */
/* -------------------------------------------------------------------------- */

function depsInstalled(repo) {
  return (
    fs.existsSync(path.join(repo, 'node_modules', '.bin')) &&
    fs.existsSync(path.join(repo, 'node_modules', 'better-sqlite3'))
  );
}

function ensureDeps(repo) {
  if (!doReset && depsInstalled(repo)) return;
  if (doReset) {
    warn('Resetting: reinstalling everything from scratch (this can take a few minutes).');
  }
  runLive(npmCmd(), ['install', '--no-fund', '--no-audit'], { cwd: repo }, 'Installing components (first run only)…');
}

function appBuilt(repo) {
  return (
    fs.existsSync(path.join(repo, 'packages', 'backend', 'dist', 'backend', 'src', 'index.js')) &&
    fs.existsSync(path.join(repo, 'packages', 'frontend', 'dist', 'index.html'))
  );
}

function ensureBuild(repo) {
  if (!doReset && appBuilt(repo)) return;
  runLive(npmCmd(), ['run', 'build:app'], { cwd: repo }, 'Building VIMO (first run only)…');
}

/* -------------------------------------------------------------------------- */
/* Networking helpers                                                          */
/* -------------------------------------------------------------------------- */

function probeFreePort(base) {
  return new Promise((resolve) => {
    const attempt = (p, left) => {
      if (left <= 0) return resolve(null);
      const srv = net.createServer();
      srv.once('error', () => {
        try {
          srv.close();
        } catch {}
        attempt(p + 1, left - 1);
      });
      srv.listen(p, '127.0.0.1', () => {
        srv.close(() => resolve(p));
      });
    };
    attempt(base, PORT_ATTEMPTS);
  });
}

async function waitForHealth(port) {
  const startedAt = Date.now();
  // Probe 127.0.0.1 explicitly: Node's fetch can resolve `localhost` to ::1,
  // which refuses connections when the server is bound to IPv4 loopback.
  // Browsers fall back between families automatically; Node's fetch may not.
  const targets = [
    `http://127.0.0.1:${port}/api/health`,
    `http://localhost:${port}/api/health`,
  ];
  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    for (const url of targets) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res.ok) return true;
      } catch {
        // not up yet — keep waiting
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

function openBrowser(url) {
  try {
    if (isWindows()) {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    warn(`Could not open your browser automatically. Please open ${url}.`);
  }
}

function killTree(pid) {
  try {
    if (isWindows()) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
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

/* -------------------------------------------------------------------------- */
/* Doctor                                                                      */
/* -------------------------------------------------------------------------- */

function doctor() {
  const results = [];
  const push = (name, good, note) => results.push({ name, good, note });

  const major = nodeMajor();
  push(
    'Node.js',
    major >= MIN_NODE_MAJOR,
    `found v${process.versions.node}` + (major > 22 ? ' (LTS 20–22 recommended)' : ''),
  );

  const npmRes = spawnSync(npmCmd(), ['--version'], { encoding: 'utf8', shell: isWindows() });
  push('npm', !npmRes.error && npmRes.status === 0, npmRes.error ? 'not found' : `v${(npmRes.stdout || '').trim()}`);

  push('Unpack tool (tar)', !!findTar(), isWindows() ? 'C:\\Windows\\System32\\tar.exe' : 'system tar');

  const home = homeDir();
  const installed = isVimoRepo(home);
  push('VIMO app files', installed, installed ? home : `not downloaded yet (will go to ${home})`);

  push('Components installed', installed && depsInstalled(home), installed ? '' : 'run `vimo` once to set up');
  push('App built', installed && appBuilt(home), installed ? '' : 'run `vimo` once to set up');

  let keyOk = false;
  if (installed) {
    try {
      const envText = fs.readFileSync(path.join(home, '.env'), 'utf8');
      const k = (envText.match(/^ENCRYPTION_KEY=(.*)$/m) || [])[1] || '';
      keyOk = k.trim().length >= 32 && !k.includes('your-');
    } catch {}
  }
  push('Security key configured', keyOk, keyOk ? '' : 'created automatically on first start');

  console.log(`\n${paint(CYAN, '[vimo]')} Environment check:`);
  for (const r of results) {
    const mark = r.good ? paint(GREEN, 'OK') : paint(YELLOW, '--');
    console.log(`  ${mark}  ${r.name.padEnd(24)} ${r.note || ''}`);
  }
  const blockers = results.filter((r) => !r.good);
  if (blockers.length) {
    console.log(`\nItems marked "${paint(YELLOW, '--')}" are fixed automatically the first time you run \`vimo\`.`);
  } else {
    console.log(`\n${paint(GREEN, 'Everything looks good — just type `vimo` to start.')}`);
  }
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const startedAt = Date.now();
  printBanner();
  checkNode();

  if (args.includes('--doctor')) doctor();

  const repo = resolveRepo();
  await ensureRepo(repo);
  const managedHome = repo === homeDir();
  ensureEnv(repo, managedHome);

  ensureDeps(repo);
  ensureBuild(repo);

  const port = await probeFreePort(portBase);
  if (!port) {
    fail(
      `No free port found between ${portBase} and ${portBase + PORT_ATTEMPTS - 1}.\n` +
        'Close some apps and try again.',
    );
  }
  if (port !== portBase) {
    log(`Port ${portBase} was busy — VIMO will use ${port} instead.`);
  }

  const entry = path.join(repo, 'packages', 'backend', 'dist', 'backend', 'src', 'index.js');
  if (!fs.existsSync(entry)) fail('VIMO is missing its built app files. Try running `vimo --reset`.');

  const url = `http://localhost:${port}`;
  log(`Starting VIMO on ${url} …`);
  log('Keep this window open. Press Ctrl+C here when you want to stop VIMO.');

  const child = spawn(process.execPath, [entry], {
    cwd: repo,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: 'inherit',
    detached: !isWindows(),
  });

  let exiting = false;
  function shutdown(signal) {
    if (exiting) return;
    exiting = true;
    if (signal) log('Stopping VIMO… see you soon!');
    if (child && child.pid) killTree(child.pid);
    setTimeout(() => process.exit(0), 400);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  child.on('exit', (code) => {
    if (!exiting) {
      exiting = true;
      if (code && code !== 0) {
        console.error(`\n${paint(RED, '[vimo] VIMO stopped unexpectedly (code ' + code + ').')}`);
        console.error(paint(RED, '[vimo] Try `vimo --reset`, or run `vimo doctor` for a health check.'));
      }
      process.exit(code ?? 0);
    }
  });

  const healthy = await waitForHealth(port);
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (!healthy) {
    warn(`VIMO didn't become reachable on ${url} within ${Math.round(HEALTH_TIMEOUT_MS / 1000)}s.`);
    warn('Check the messages above for an error, then run `vimo` again.');
    // Don't leave a half-started app running behind the user's back.
    if (child && child.pid) killTree(child.pid);
    process.exit(1);
  }

  const line = paint(DIM, '─'.repeat(52));
  console.log(`
${line}
  ${paint(BOLD + GREEN, `VIMO is ready! (${seconds}s)`)}

  ${paint(DIM, 'Open:  ')} ${url}
  ${paint(DIM, 'Stop:  ')} press Ctrl+C in this window
  ${paint(DIM, 'Data:  ')} ${path.join(repo, 'data')}
  ${paint(DIM, 'Update:')} run \`vimo --update\`

  Next time, just type ${paint(BOLD + CYAN, 'vimo')}.
${line}
`);

  if (!noOpen) openBrowser(url);
}

main().catch((err) => {
  fail(err && err.message ? err.message : String(err));
});
