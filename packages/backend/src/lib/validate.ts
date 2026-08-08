/**
 * Request validation at the HTTP boundary.
 *
 * Every route used to read `request.body as { ... }`, which is a compile-time
 * lie: TypeScript believes the shape, the runtime receives whatever the client
 * sent. A missing field then surfaced deep in business logic as
 * `TypeError: Cannot read properties of undefined` and a 500, instead of a 400
 * at the edge.
 *
 * Usage:
 *
 *   const body = parseBody(SetupPinSchema, request, reply);
 *   if (!body) return;   // 400 already sent
 *
 * The `if (!body) return` line is required. `parseBody` sends the error
 * response itself and returns undefined so handlers stay flat instead of
 * nesting a try/catch around every parse.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodError, ZodType } from 'zod';

export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. `credentials.apiKey`. */
  path: string;
  message: string;
}

export interface ValidationErrorBody {
  error: 'ValidationError';
  message: string;
  issues: ValidationIssue[];
}

/** Flatten a ZodError into a stable, client-friendly shape. */
export function formatZodError(error: ZodError): ValidationErrorBody {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  const summary =
    issues.length === 1
      ? `${issues[0].path}: ${issues[0].message}`
      : `${issues.length} fields are invalid`;

  return { error: 'ValidationError', message: summary, issues };
}

/**
 * Core parser. On failure replies 400 and returns undefined.
 *
 * `reply.sent` is not consulted here — Fastify handlers must `return` right
 * after a failed parse, which every call site does.
 */
function parse<T>(
  schema: ZodType<T>,
  data: unknown,
  reply: FastifyReply,
): T | undefined {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  reply.status(400).send(formatZodError(result.error));
  return undefined;
}

/** Validate `request.body`. Replies 400 and returns undefined on failure. */
export function parseBody<T>(
  schema: ZodType<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  // A JSON body is optional at the transport level, so an absent body arrives
  // as undefined. Normalising to {} lets schemas report "required" per field
  // rather than one opaque "expected object" error.
  return parse(schema, request.body ?? {}, reply);
}

/** Validate `request.query`. Replies 400 and returns undefined on failure. */
export function parseQuery<T>(
  schema: ZodType<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  return parse(schema, request.query ?? {}, reply);
}

/** Validate `request.params`. Replies 400 and returns undefined on failure. */
export function parseParams<T>(
  schema: ZodType<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  return parse(schema, request.params ?? {}, reply);
}
