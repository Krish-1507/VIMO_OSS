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
    } catch {
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
    set({ isAuthenticated: true, sessionToken: token });
    connect(token);
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
      const token = localStorage.getItem('session_token');
      if (res.data.isAuthenticated && token) {
        connect(token);
      }
      set({
        isSetupComplete: res.data.isSetupComplete,
        isAuthenticated: res.data.isAuthenticated,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
