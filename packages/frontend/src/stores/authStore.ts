import { create } from 'zustand';
import api from '../lib/api';
import { connect, socket } from '../lib/socket';

interface AuthState {
  isSetupComplete: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  isLoading: boolean;
  setAuth: (token: string) => void;
  clearAuth: () => void;
  checkAuthStatus: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isSetupComplete: false,
  isAuthenticated: false,
  sessionToken: (() => {
    try {
      return localStorage.getItem('session_token');
    } catch (err) {
      console.warn('[vimo] failed to read session_token:', err);
      return null;
    }
  })(),
  isLoading: true,
  setAuth: (token: string) => {
    try {
      localStorage.setItem('session_token', token);
    } catch (err) {
      // ignore
      console.warn('[vimo] best-effort operation failed:', err);
    }
    // After a successful verify/setup the server is now setup-complete
    set({ isAuthenticated: true, sessionToken: token, isSetupComplete: true, isLoading: false });
    if (token !== 'demo-session') {
      try { localStorage.setItem('hasPassedSystemCheck', 'true'); window.dispatchEvent(new Event('vimo:systemCheckChanged')); } catch (err) { console.warn('[vimo] failed to persist system check flag after auth:', err); }
    }
    connect(token);
    // Re-sync with server in background to ensure isSetupComplete is authoritative
    api.get('/api/auth/status').then((res) => {
      set({
        isSetupComplete: res.data.isSetupComplete,
        isAuthenticated: res.data.isAuthenticated,
      });
    }).catch((err) => console.warn('[vimo] background auth sync failed:', err));
  },
  clearAuth: () => {
    try {
      localStorage.removeItem('session_token');
    } catch (err) {
      // ignore
      console.warn('[vimo] best-effort operation failed:', err);
    }
    socket.disconnect();
    set({ isAuthenticated: false, sessionToken: null });
  },
  checkAuthStatus: async () => {
    try {
      const res = await api.get('/api/auth/status');
      const token = (() => { try { return localStorage.getItem('session_token'); } catch (err) { console.warn('[vimo] failed to read token in checkAuthStatus:', err); return null; } })();
      if (res.data.isAuthenticated && token) {
        connect(token);
      }
      set({
        isSetupComplete: res.data.isSetupComplete,
        isAuthenticated: res.data.isAuthenticated,
        isLoading: false,
      });
    } catch (err) {
      console.warn('[vimo] checkAuthStatus failed:', err);
      set({ isLoading: false });
    }
  },
}));
