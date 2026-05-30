'use client';

import { create } from 'zustand';

export type Color = 'w' | 'b';

export interface MatchHistoryItem {
  ply: number;
  san: string;
  uci: string;
}

export interface MatchState {
  matchId: string | null;
  fen: string;
  myColor: Color | null;
  opponentId: string | null;
  initialMs: number;
  incrementMs: number;
  whiteMs: number;
  blackMs: number;
  turn: Color;
  history: MatchHistoryItem[];
  /** epoch ms when the current side's clock started ticking from whiteMs/blackMs */
  clockTickFrom: number;
  ended: null | { outcome: 'WHITE_WON' | 'BLACK_WON' | 'DRAW'; reason: string };
  drawOfferFrom: Color | null;
  queueStatus: 'idle' | 'waiting' | 'matched';
  chain: { matchTx: string | null; settledAt: string | null } | null;

  setQueueStatus: (s: MatchState['queueStatus']) => void;
  onMatchStart: (p: {
    matchId: string;
    whitePlayerId: string;
    blackPlayerId: string;
    myUserId: string;
    fen: string;
    initialMs: number;
    incrementMs: number;
  }) => void;
  onMatchMove: (p: {
    ply: number;
    san: string;
    uci: string;
    fenAfter: string;
    whiteMs: number;
    blackMs: number;
    turn: Color;
  }) => void;
  onDrawOffer: (from: Color) => void;
  onMatchEnd: (p: { outcome: 'WHITE_WON' | 'BLACK_WON' | 'DRAW'; reason: string }) => void;
  setChain: (c: { matchTx: string | null; settledAt: string | null } | null) => void;
  /** Rehydrate from a full snapshot — used on page reload to rejoin an active match. */
  hydrate: (p: {
    matchId: string;
    whitePlayerId: string;
    blackPlayerId: string;
    myUserId: string;
    fen: string;
    initialMs: number;
    incrementMs: number;
    whiteMs: number;
    blackMs: number;
    turn: Color;
    ply: number;
    history: MatchHistoryItem[];
    drawOfferFrom: Color | null;
  }) => void;
  reset: () => void;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const initial = (): Omit<
  MatchState,
  | 'setQueueStatus'
  | 'onMatchStart'
  | 'onMatchMove'
  | 'onDrawOffer'
  | 'onMatchEnd'
  | 'hydrate'
  | 'setChain'
  | 'reset'
> => ({
  matchId: null,
  fen: INITIAL_FEN,
  myColor: null,
  opponentId: null,
  initialMs: 0,
  incrementMs: 0,
  whiteMs: 0,
  blackMs: 0,
  turn: 'w',
  history: [],
  clockTickFrom: 0,
  ended: null,
  drawOfferFrom: null,
  queueStatus: 'idle',
  chain: null,
});

export const useMatch = create<MatchState>((set) => ({
  ...initial(),
  setQueueStatus: (s) => set({ queueStatus: s }),
  onMatchStart: (p) =>
    set({
      matchId: p.matchId,
      fen: p.fen,
      myColor: p.whitePlayerId === p.myUserId ? 'w' : 'b',
      opponentId: p.whitePlayerId === p.myUserId ? p.blackPlayerId : p.whitePlayerId,
      initialMs: p.initialMs,
      incrementMs: p.incrementMs,
      whiteMs: p.initialMs,
      blackMs: p.initialMs,
      turn: 'w',
      history: [],
      clockTickFrom: Date.now(),
      ended: null,
      drawOfferFrom: null,
      queueStatus: 'matched',
    }),
  onMatchMove: (p) =>
    set((s) => ({
      fen: p.fenAfter,
      whiteMs: p.whiteMs,
      blackMs: p.blackMs,
      turn: p.turn,
      history: [...s.history, { ply: p.ply, san: p.san, uci: p.uci }],
      clockTickFrom: Date.now(),
      drawOfferFrom: null,
    })),
  onDrawOffer: (from) => set({ drawOfferFrom: from }),
  onMatchEnd: (p) => set({ ended: p }),
  setChain: (c) => set({ chain: c }),
  hydrate: (p) =>
    set({
      matchId: p.matchId,
      fen: p.fen,
      myColor: p.whitePlayerId === p.myUserId ? 'w' : 'b',
      opponentId:
        p.whitePlayerId === p.myUserId ? p.blackPlayerId : p.whitePlayerId,
      initialMs: p.initialMs,
      incrementMs: p.incrementMs,
      whiteMs: p.whiteMs,
      blackMs: p.blackMs,
      turn: p.turn,
      history: p.history,
      clockTickFrom: Date.now(),
      ended: null,
      drawOfferFrom: p.drawOfferFrom,
      queueStatus: 'matched',
    }),
  reset: () => set(initial()),
}));
