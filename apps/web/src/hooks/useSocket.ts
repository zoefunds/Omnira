'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

export function useSocket(token: string | null): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }
    const s = getSocket(token);
    setSocket(s);
    return () => {
      // don't disconnect — the socket is module-singleton and survives navigation
    };
  }, [token]);

  return socket;
}
