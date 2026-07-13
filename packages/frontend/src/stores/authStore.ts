import { create } from 'zustand';
import api from '../lib/api';

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
    } catch {
      // ignore
    }
    set({ isAuthenticated: true, sessionToken: token });
  },
  clearAuth: () => {
    try {
      localStorage.removeItem('session_token');
    } catch {
      // ignore
    }
    set({ isAuthenticated: false, sessionToken: null });
  },
  checkAuthStatus: async () => {
    try {
      const res = await api.get('/api/auth/status');
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
