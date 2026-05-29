'use client';

import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './config';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string): Socket {
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket) socket.disconnect();
  currentToken = token;
  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
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
