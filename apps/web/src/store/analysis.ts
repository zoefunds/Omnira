'use client';

import { create } from 'zustand';

export type MoveClass = 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

export interface PerMove {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  evalBeforeCp: number | null;
  evalBeforeMate: number | null;
  bestMoveUci: string;
  bestMoveSan: string;
  evalAfterCp: number | null;
  evalAfterMate: number | null;
  cpLoss: number | null;
  classification: MoveClass;
}

export interface EngineReport {
  depth: number;
  perMove: PerMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteCounts: Record<MoveClass, number>;
  blackCounts: Record<MoveClass, number>;
  // Stub-on-failure variant from the worker
  error?: string;
}

export interface AnalysisReport {
  matchId: string;
  engineReport: EngineReport | { error: string };
  llmSummary: string;
  llmReport: Record<string, unknown>;
  alternatives: Array<unknown>;
  generatedAt: string;
}

interface AnalysisState {
  byMatch: Record<string, AnalysisReport>;
  set: (matchId: string, r: AnalysisReport) => void;
}

export const useAnalysis = create<AnalysisState>((set) => ({
  byMatch: {},
  set: (matchId, r) => set((s) => ({ byMatch: { ...s.byMatch, [matchId]: r } })),
}));
