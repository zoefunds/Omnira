'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiUser } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: ApiUser | null;
  setSession: (s: { token: string; user: ApiUser }) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (s) => set({ token: s.token, user: s.user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: 'omnira.auth' },
  ),
);
