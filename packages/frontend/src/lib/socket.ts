import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config/backendPort';

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
});

export function connect(sessionToken: string) {
  socket.auth = { token: sessionToken };
  socket.connect();
}

socket.on('welcome', (data: { message: string }) => {
  // eslint-disable-next-line no-console
  console.log(data.message);
});
