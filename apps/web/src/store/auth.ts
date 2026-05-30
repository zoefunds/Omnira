'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiUser } from '@/lib/api';

interface AuthState {
  /** True once persist middleware has rehydrated from localStorage. */
  hydrated: boolean;
  token: string | null;
  user: ApiUser | null;
  setSession: (s: { token: string; user: ApiUser }) => void;
  clear: () => void;
  _setHydrated: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      hydrated: false,
      token: null,
      user: null,
      setSession: (s) => set({ token: s.token, user: s.user }),
      clear: () => set({ token: null, user: null }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'omnira.auth',
      // Don't persist the runtime hydration flag itself
      partialize: (s) => ({ token: s.token, user: s.user }) as Partial<AuthState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
