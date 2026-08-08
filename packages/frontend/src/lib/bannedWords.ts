// Words that must NEVER appear in user-facing strings.
// VIMO is built for non-technical marketers — no developer jargon.
// CI enforces this list via scripts/check-banned-words.mjs. Add a term here
// only if it has a plain-English replacement; fix the UI copy in the same PR.
export const BANNED_WORDS: string[] = [
  'oauth',
  'client id',
  'client secret',
  'redirect uri',
  'redirect url',
  'pkce',
  'mcp',
  'webhook',
];
