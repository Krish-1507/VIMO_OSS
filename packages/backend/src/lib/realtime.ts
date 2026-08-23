import type { Server } from 'socket.io';

/**
 * Decoupled handle to the Socket.IO server.
 *
 * Services used to `import { io } from '../index'` — which dragged the entire
 * server entrypoint (Fastify bootstrap, migrations, cron scheduling, Redis
 * probes) into every service's module graph. That made test runs and any
 * dynamic import of a service unexpectedly boot the whole app, and created
 * import cycles between index.ts and the routes/services it registers.
 *
 * index.ts calls setSocketServer() once the server exists; everywhere else
 * uses emitToClients(), which is a safe no-op before that point.
 */
let socketServer: Server | null = null;

export function setSocketServer(server: Server | null): void {
  socketServer = server;
}

export function getSocketServer(): Server | null {
  return socketServer;
}

/** Broadcast to all connected clients; no-op when the server isn't running. */
export function emitToClients(event: string, payload: unknown): void {
  if (!socketServer) return;
  try {
    socketServer.emit(event, payload);
  } catch (err) {
    // A dead socket must never take down the calling service.
    console.warn('[vimo] best-effort operation failed:', err);
  }
}
