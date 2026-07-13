/**
 * Sanitizes user input to prevent prompt injection and ensure safety.
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return '';

  let sanitized = input;

  // 1. Prompt injection protection
  const injectionPatterns = [
    /ignore previous instructions/gi,
    /forget your instructions/gi,
    /you are now/gi,
    /pretend you are/gi,
    /act as/gi,
    /jailbreak/gi,
    /bypass/gi,
    /system prompt/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // 2. Collapse more than 3 consecutive newlines to 2
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n');

  // 3. Truncate if exceeding 5000 characters
  if (sanitized.length > 5000) {
    sanitized = sanitized.slice(0, 5000) + '\n\n[CONTENT TRUNCATED FOR SECURITY]';
  }

  return sanitized;
}
