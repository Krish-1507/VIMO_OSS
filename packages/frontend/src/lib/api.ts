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

export default api;
