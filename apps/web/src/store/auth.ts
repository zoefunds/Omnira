'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiUser } from '@/lib/api';

interface AuthState {
  /** True once persist middleware has rehydrated from localStorage. */
  hydrated: boolean;
  token: string | null;
  refreshToken: string | null;
  user: ApiUser | null;
  setSession: (s: { token: string; refreshToken?: string | null; user: ApiUser }) => void;
  setToken: (t: string) => void;
  clear: () => void;
  _setHydrated: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      hydrated: false,
      token: null,
      refreshToken: null,
      user: null,
      setSession: (s) => set({ token: s.token, refreshToken: s.refreshToken ?? null, user: s.user }),
      setToken: (t) => set({ token: t }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'omnira.auth',
      // Don't persist the runtime hydration flag itself
      partialize: (s) => ({ token: s.token, refreshToken: s.refreshToken, user: s.user }) as Partial<AuthState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
