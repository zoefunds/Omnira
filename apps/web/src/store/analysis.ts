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

export interface PhaseAssessment {
  name?: string | null;
  eco?: string | null;
  type?: string | null;
  structure?: string | null;
  plans?: string | null;
  assessment: string | null;
}

export interface TurningPoint {
  ply: number;
  san: string;
  best_san: string;
  what_happened: string;
  tactical_motif?: string | null;
}

export interface LlmReport {
  summary?: string;
  opening?: PhaseAssessment;
  middlegame?: PhaseAssessment;
  endgame?: PhaseAssessment;
  turning_points?: TurningPoint[];
  themes?: string[];
  advice?: { white?: string; black?: string };
  // graceful fallback if model returned non-JSON
  raw?: string;
}

export interface AnalysisReport {
  matchId: string;
  engineReport: EngineReport | { error: string };
  llmSummary: string;
  llmReport: LlmReport;
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
