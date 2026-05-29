import { Chess } from 'chess.js';
import { Stockfish } from './stockfish.js';

export type MoveClass = 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

export interface PerMoveAnalysis {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  /** Eval at fenBefore from the side-to-move's POV (in centipawns; null if mate). */
  evalBeforeCp: number | null;
  evalBeforeMate: number | null;
  /** Engine's best move at fenBefore, in UCI. */
  bestMoveUci: string;
  bestMoveSan: string;
  /** Eval after the player's actual move, again from the original mover's POV. */
  evalAfterCp: number | null;
  evalAfterMate: number | null;
  /** centipawn loss (>=0). null if mate evals make it undefined. */
  cpLoss: number | null;
  classification: MoveClass;
}

export interface GameAnalysis {
  depth: number;
  perMove: PerMoveAnalysis[];
  whiteAccuracy: number; // 0..100
  blackAccuracy: number;
  whiteCounts: Record<MoveClass, number>;
  blackCounts: Record<MoveClass, number>;
}

// Lichess-style cp-loss thresholds.
const T_INACCURACY = 50;
const T_MISTAKE = 100;
const T_BLUNDER = 200;
// Treat the first 8 plies as opening prep when both engine and player agree.
const BOOK_PLY = 8;

function classify(cpLoss: number | null, ply: number, played: string, best: string): MoveClass {
  if (cpLoss == null) return 'good';
  if (played === best && ply <= BOOK_PLY) return 'book';
  if (cpLoss >= T_BLUNDER) return 'blunder';
  if (cpLoss >= T_MISTAKE) return 'mistake';
  if (cpLoss >= T_INACCURACY) return 'inaccuracy';
  return 'good';
}

/** Crude accuracy: average (100 - cpLoss/2), clamped 0..100. */
function accuracyFromCpLosses(losses: Array<number | null>): number {
  const numeric = losses.filter((x): x is number => x != null);
  if (numeric.length === 0) return 100;
  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return Math.max(0, Math.min(100, 100 - avg / 2));
}

function uciToSan(fenBefore: string, uci: string): string {
  if (uci === '(none)' || !uci || uci.length < 4) return uci;
  const c = new Chess(fenBefore);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci[4] : undefined;
  try {
    const m = c.move({ from, to, promotion: promo });
    return m?.san ?? uci;
  } catch {
    return uci;
  }
}

/** Normalize engine score to centipawns FOR WHITE, then flip to side-to-move below. */
function scoreFromWhitePerspective(
  cp: number | undefined,
  mate: number | undefined,
  sideToMove: 'w' | 'b',
): { cp: number | null; mate: number | null } {
  let outCp: number | null = cp ?? null;
  let outMate: number | null = mate ?? null;
  if (sideToMove === 'b') {
    if (outCp != null) outCp = -outCp;
    if (outMate != null) outMate = -outMate;
  }
  return { cp: outCp, mate: outMate };
}

/** Convert side-to-move-relative cp eval to a comparable "mover POV" cp before/after. */
function moverScoreCp(
  whiteCp: number | null,
  whiteMate: number | null,
  mover: 'w' | 'b',
): { cp: number | null; mate: number | null } {
  if (mover === 'w') return { cp: whiteCp, mate: whiteMate };
  return {
    cp: whiteCp == null ? null : -whiteCp,
    mate: whiteMate == null ? null : -whiteMate,
  };
}

export async function analyzeGame(
  pgn: string,
  stockfish: Stockfish,
  depth = 12,
): Promise<GameAnalysis> {
  const game = new Chess();
  try {
    // chess.js 1.0-beta: loadPgn returns void and throws on parse failure.
    (game as unknown as { loadPgn: (p: string, o?: unknown) => void }).loadPgn(pgn, { strict: false });
  } catch (e) {
    throw new Error(`failed to load pgn: ${(e as Error).message}`);
  }
  const history = game.history({ verbose: true }) as Array<{
    from: string;
    to: string;
    promotion?: string;
    san: string;
    before: string;   // FEN before this move
    after: string;    // FEN after this move
    color: 'w' | 'b';
  }>;

  if (history.length === 0) throw new Error('pgn loaded but contains no moves');
  const perMove: PerMoveAnalysis[] = [];

  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    const ply = i + 1;
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;

    // Eval before — what the engine thinks for whoever's to move (which IS the mover).
    const before = await stockfish.go(m.before, depth);
    const beforeWhite = scoreFromWhitePerspective(before.cp, before.mate, m.color);
    const beforeForMover = moverScoreCp(beforeWhite.cp, beforeWhite.mate, m.color);

    // Eval after — from the opponent's POV. Convert back to mover POV.
    const after = await stockfish.go(m.after, depth);
    const opp: 'w' | 'b' = m.color === 'w' ? 'b' : 'w';
    const afterWhite = scoreFromWhitePerspective(after.cp, after.mate, opp);
    const afterForMover = moverScoreCp(afterWhite.cp, afterWhite.mate, m.color);

    let cpLoss: number | null = null;
    if (beforeForMover.cp != null && afterForMover.cp != null) {
      cpLoss = Math.max(0, beforeForMover.cp - afterForMover.cp);
    } else if (beforeForMover.mate != null && afterForMover.mate == null) {
      // Had mate, lost it → huge equivalent loss.
      cpLoss = 500;
    } else if (beforeForMover.mate == null && afterForMover.mate != null && afterForMover.mate < 0) {
      // No mate before, now getting mated → blunder.
      cpLoss = 500;
    }

    const bestMoveSan = uciToSan(m.before, before.bestMove);
    const cls = classify(cpLoss, ply, uci, before.bestMove);

    perMove.push({
      ply,
      san: m.san,
      uci,
      fenBefore: m.before,
      evalBeforeCp: beforeForMover.cp,
      evalBeforeMate: beforeForMover.mate,
      bestMoveUci: before.bestMove,
      bestMoveSan,
      evalAfterCp: afterForMover.cp,
      evalAfterMate: afterForMover.mate,
      cpLoss,
      classification: cls,
    });
  }

  const whiteLosses = perMove.filter((p) => p.ply % 2 === 1).map((p) => p.cpLoss);
  const blackLosses = perMove.filter((p) => p.ply % 2 === 0).map((p) => p.cpLoss);

  function counts(items: PerMoveAnalysis[]): Record<MoveClass, number> {
    const c: Record<MoveClass, number> = { good: 0, inaccuracy: 0, mistake: 0, blunder: 0, book: 0 };
    for (const it of items) c[it.classification] += 1;
    return c;
  }

  return {
    depth,
    perMove,
    whiteAccuracy: accuracyFromCpLosses(whiteLosses),
    blackAccuracy: accuracyFromCpLosses(blackLosses),
    whiteCounts: counts(perMove.filter((p) => p.ply % 2 === 1)),
    blackCounts: counts(perMove.filter((p) => p.ply % 2 === 0)),
  };
}
