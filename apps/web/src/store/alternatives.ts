'use client';

import { create } from 'zustand';

export interface ApiAlternative {
  id: string;
  matchId: string;
  ply: number;
  alternativeUci: string;
  alternativeSan: string;
  fenBefore: string;
  playedSan: string;
  playedEvalCp: number | null;
  playedEvalMate: number | null;
  altEvalCp: number | null;
  altEvalMate: number | null;
  cpDelta: number | null;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface State {
  byMatch: Record<string, ApiAlternative[]>;
  setAll: (matchId: string, items: ApiAlternative[]) => void;
  upsert: (item: ApiAlternative) => void;
}

export const useAlternatives = create<State>((set) => ({
  byMatch: {},
  setAll: (matchId, items) =>
    set((s) => ({ byMatch: { ...s.byMatch, [matchId]: items } })),
  upsert: (item) =>
    set((s) => {
      const list = s.byMatch[item.matchId] ?? [];
      const next = list.filter((x) => x.id !== item.id).concat(item);
      next.sort((a, b) => a.ply - b.ply || a.createdAt.localeCompare(b.createdAt));
      return { byMatch: { ...s.byMatch, [item.matchId]: next } };
    }),
}));
