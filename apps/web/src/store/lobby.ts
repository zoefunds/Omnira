'use client';

import { create } from 'zustand';
import type { ApiChallenge } from '@/lib/api';

interface LobbyState {
  challenges: ApiChallenge[];
  setChallenges: (c: ApiChallenge[]) => void;
  upsert: (c: ApiChallenge) => void;
  remove: (code: string) => void;
}

export const useLobby = create<LobbyState>((set) => ({
  challenges: [],
  setChallenges: (c) => set({ challenges: c }),
  upsert: (c) =>
    set((s) => {
      const next = s.challenges.filter((x) => x.code !== c.code);
      if (c.status === 'OPEN' && c.isPublic) next.unshift(c);
      return { challenges: next };
    }),
  remove: (code) => set((s) => ({ challenges: s.challenges.filter((c) => c.code !== code) })),
}));
