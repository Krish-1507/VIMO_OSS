import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    localStorage.clear();
  });

  it('initially isAuthenticated is false', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('setAuth sets isAuthenticated to true and writes to localStorage', () => {
    useAuthStore.getState().setAuth('test-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem('session_token')).toBe('test-token');
  });

  it('clearAuth sets isAuthenticated to false and removes from localStorage', () => {
    useAuthStore.getState().setAuth('test-token');
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('session_token')).toBeNull();
  });
});
