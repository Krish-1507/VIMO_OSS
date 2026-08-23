import axios from 'axios';
import { BACKEND_URL } from '../config/backendPort';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  let token: string | null = null;
  try {
    token = localStorage.getItem('session_token');
  } catch {
    token = null;
  }

  if (token) {
    config.headers['x-session-token'] = token;
    // Double-submit CSRF token (matches the backend's state-changing check).
    // VIMO auth uses a header, not a cookie, so this is defense-in-depth and is
    // forward-compatible with future cookie-based sessions.
    config.headers['x-csrf-token'] = token;
  }
  return config;
});

/**
 * Session renewal on 401.
 *
 * Sessions last 24h; without this, an active user hits a hard wall mid-task.
 * On the first 401 we try POST /api/auth/renew once with the stored token:
 *  - renewed → retry the original request transparently with the fresh token;
 *  - expired → clear the session and return the user to the login screen.
 * Auth endpoints themselves never trigger renewal (prevents loops), parallel
 * 401s share one renewal attempt, and every retried request is marked so a
 * second failure falls through to normal error handling.
 */
let renewing: Promise<string | null> | null = null;

function renewSession(): Promise<string | null> {
  if (!renewing) {
    renewing = (async () => {
      try {
        const stored = localStorage.getItem('session_token');
        if (!stored) return null;
        const res = await fetch('/api/auth/renew', {
          method: 'POST',
          headers: { 'x-session-token': stored },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.token ?? null;
      } catch {
        return null;
      } finally {
        // Allow a later renewal after this one settles.
        setTimeout(() => {
          renewing = null;
        }, 0);
      }
    })();
  }
  return renewing;
}

function redirectToLogin() {
  let hadToken = false;
  try {
    hadToken = !!localStorage.getItem('session_token');
    localStorage.removeItem('session_token');
  } catch (err) {
    // storage unavailable — nothing to clear
    console.warn('[vimo] best-effort operation failed:', err);
  }
  const onAuthScreen =
    window.location.pathname.startsWith('/login') ||
    window.location.pathname.startsWith('/setup') ||
    window.location.pathname.startsWith('/system-check');
  if (hadToken && !onAuthScreen) {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || '';
    const isAuthCall = url.startsWith('/api/auth');

    // Demo mode uses a fake token the server deliberately rejects. Pages show
    // their own sample data instead of hitting the API, so a 401 here is normal
    // and must never kick the user out to the login screen.
    let storedToken: string | null = null;
    try {
      storedToken = localStorage.getItem('session_token');
    } catch {
      storedToken = null;
    }
    if (storedToken === 'demo-session') {
      return Promise.reject(error);
    }

    if (status === 401 && !isAuthCall && !error.config?._retriedAfterRenew) {
      const freshToken = await renewSession();
      if (freshToken && error.config) {
        error.config._retriedAfterRenew = true;
        error.config.headers['x-session-token'] = freshToken;
        error.config.headers['x-csrf-token'] = freshToken;
        return api.request(error.config);
      }
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);

export default api;
