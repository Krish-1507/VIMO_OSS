// Same-origin by default: in production the backend serves the frontend from
// one port, and in dev the Vite proxy forwards /api and /socket.io to :3000.
// VITE_BACKEND_URL can still override this for split deployments.
const viteUrl = typeof import.meta !== 'undefined' ? import.meta.env.VITE_BACKEND_URL : undefined;
export const BACKEND_URL = viteUrl || '';
