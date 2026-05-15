import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  // Prevent server-side code from running this
  if (typeof window === 'undefined') {
    return null as unknown as Socket; 
  }

  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      autoConnect: false,
    });
  }
  return socket;
}
