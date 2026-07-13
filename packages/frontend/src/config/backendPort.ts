const viteUrl = typeof import.meta !== 'undefined' ? import.meta.env.VITE_BACKEND_URL : undefined;
export const BACKEND_URL = viteUrl || 'http://localhost:3000';
