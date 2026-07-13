/**
 * Structured logger for VIMO.
 *
 * Output is structured so contributors debugging their own Pack/connector can
 * grep, filter, and pipe logs instead of squinting at ad-hoc console.warn
 * lines. When stdout is a TTY we print a friendly single-line format; when it
 * is NOT a TTY (CI, containers, `npm run dev | jq`) we emit one JSON object
 * per line so the logs are machine-parseable.
 *
 * Usage:
 *   import { createLogger } from '../lib/logger';
 *   const log = createLogger('llm');
 *   log.info('provider resolved', { provider: 'openai', model: 'gpt-4o' });
 *   log.warn('provider failed, trying next', { provider: 'anthropic', err: e.message });
 */

import { inspect } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

const THRESHOLD: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) && LEVEL_WEIGHT[process.env.LOG_LEVEL as LogLevel]
    ? (process.env.LOG_LEVEL as LogLevel)
    : 'info';

// Stable, key-ordered JSON so log aggregation/alerting can rely on field names.
function safeStringify(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta);
  } catch {
    try {
      return inspect(meta, { depth: 4, breakLength: Infinity });
    } catch {
      return '[unserializable]';
    }
  }
}

function render(level: LogLevel, name: string, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();

  if (!process.stdout.isTTY) {
    const entry: Record<string, unknown> = { ts, level, logger: name, msg };
    if (meta && Object.keys(meta).length > 0) Object.assign(entry, meta);
    return safeStringify(entry);
  }

  const color = LEVEL_COLOR[level];
  const metaStr =
    meta && Object.keys(meta).length > 0 ? ` ${safeStringify(meta)}` : '';
  return `${color}${ts} ${level.toUpperCase().padEnd(5)}${RESET} \x1b[35m[${name}]\x1b[0m ${msg}${metaStr}`;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** Create a child logger namespaced under this one (e.g. `llm:router`). */
  child(name: string): Logger;
  /** Current logger name (useful for tests). */
  readonly name: string;
}

function build(name: string): Logger {
  const emit = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[THRESHOLD]) return;
    const line = render(level, name, msg, meta);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };

  return {
    name,
    debug: (msg, meta) => emit('debug', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
    child: (childName: string) => build(`${name}:${childName}`),
  };
}

export function createLogger(name: string): Logger {
  return build(name);
}

/** Root VIMO logger. */
export const logger = createLogger('vimo');
