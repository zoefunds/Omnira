'use client';

import { create } from 'zustand';

export interface ChatItem {
  id: string;
  matchId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: string;
}

interface ChatState {
  byMatch: Record<string, ChatItem[]>;
  setHistory: (matchId: string, items: ChatItem[]) => void;
  append: (msg: ChatItem) => void;
  clearMatch: (matchId: string) => void;
}

export const useChat = create<ChatState>((set) => ({
  byMatch: {},
  setHistory: (matchId, items) =>
    set((s) => ({ byMatch: { ...s.byMatch, [matchId]: items } })),
  append: (msg) =>
    set((s) => {
      const list = s.byMatch[msg.matchId] ?? [];
      if (list.some((x) => x.id === msg.id)) return s;
      return { byMatch: { ...s.byMatch, [msg.matchId]: [...list, msg] } };
    }),
  clearMatch: (matchId) =>
    set((s) => {
      const next = { ...s.byMatch };
      delete next[matchId];
      return { byMatch: next };
    }),
}));
