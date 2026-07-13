/**
 * CSRF protection for the frontend.
 *
 * VIMO authenticates with the `x-session-token` header (not a cookie), which
 * already prevents classic CSRF. As defense-in-depth — and to be
 * forward-compatible with future cookie-based sessions — every state-changing
 * request must also carry an `x-csrf-token` equal to the session token
 * (double-submit pattern), which the backend verifies.
 *
 * This module patches `window.fetch` once so the token is attached to every
 * outgoing request automatically, including the many direct `fetch` calls
 * scattered across the UI, without touching each one.
 */
function addHeader(
  existing: RequestInit['headers'],
  key: string,
  value: string,
): RequestInit['headers'] {
  if (existing instanceof Headers) {
    existing.set(key, value);
    return existing;
  }
  if (Array.isArray(existing)) {
    return [...existing, [key, value]] as [string, string][];
  }
  return { ...(existing as Record<string, string> | undefined), [key]: value };
}

function readSessionToken(): string | null {
  try {
    return localStorage.getItem('session_token');
  } catch {
    return null;
  }
}

export function installCsrfProtection(): void {
  if (typeof window === 'undefined' || !window.fetch) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = readSessionToken();
    if (token && init) {
      init.headers = addHeader(init.headers, 'x-csrf-token', token);
    }
    return originalFetch(input, init);
  };
}

// Self-install on import.
installCsrfProtection();
