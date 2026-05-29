export type Color = 'w' | 'b';

export type TimeControlCategory = 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';

export type ResultReason =
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'THREEFOLD_REPETITION'
  | 'FIFTY_MOVE_RULE'
  | 'INSUFFICIENT_MATERIAL'
  | 'RESIGNATION'
  | 'TIMEOUT'
  | 'AGREEMENT'
  | 'ABANDONMENT';

export type Outcome = 'WHITE_WON' | 'BLACK_WON' | 'DRAW';

export interface MoveInput {
  /** UCI form e.g. "e2e4" or "e7e8q" for promotions. Preferred over SAN for network input. */
  uci: string;
}

export interface MoveResult {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  turn: Color;
  inCheck: boolean;
  gameOver: GameOverState | null;
}

export interface GameOverState {
  outcome: Outcome;
  reason: ResultReason;
}

export interface TimeControl {
  category: TimeControlCategory;
  /** Base time per side, in milliseconds. */
  initialMs: number;
  /** Fischer increment, in milliseconds. */
  incrementMs: number;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  turn: Color;
  /** epoch ms at which the current side's clock started ticking. null = paused (game not started or finished). */
  turnStartedAt: number | null;
}
