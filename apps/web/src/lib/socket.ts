'use client';

import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './config';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string): Socket {
  // Return the same socket instance whenever the token matches, regardless of
  // whether the underlying WebSocket has finished its handshake. Socket.IO
  // handles reconnection on its own; tearing the socket down here causes the
  // server to emit to a stale `user:${userId}` room and the client misses
  // events (notably `match:start`) during the brief reconnect window.
  if (socket && currentToken === token) return socket;
  if (socket) socket.disconnect();
  currentToken = token;
  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}
