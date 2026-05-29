import { Chess } from 'chess.js';
import type { GameOverState, MoveResult, Color } from './types.js';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class IllegalMoveError extends Error {
  constructor(public uci: string, public fen: string) {
    super(`illegal move ${uci} from ${fen}`);
  }
}

function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  // e2e4, e7e8q
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`invalid uci string: ${uci}`);
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length === 5 ? uci[4] : undefined;
  return { from, to, promotion };
}

function detectGameOver(chess: Chess): GameOverState | null {
  if (chess.isCheckmate()) {
    // Side to move is checkmated → other side won.
    const winner: Color = chess.turn() === 'w' ? 'b' : 'w';
    return { outcome: winner === 'w' ? 'WHITE_WON' : 'BLACK_WON', reason: 'CHECKMATE' };
  }
  if (chess.isStalemate()) return { outcome: 'DRAW', reason: 'STALEMATE' };
  if (chess.isThreefoldRepetition()) return { outcome: 'DRAW', reason: 'THREEFOLD_REPETITION' };
  if (chess.isInsufficientMaterial())
    return { outcome: 'DRAW', reason: 'INSUFFICIENT_MATERIAL' };
  if (chess.isDraw()) {
    // chess.js bundles the 50-move rule + threefold + insufficient + stalemate under isDraw().
    // We've already checked the specific ones above, so reaching here means 50-move.
    return { outcome: 'DRAW', reason: 'FIFTY_MOVE_RULE' };
  }
  return null;
}

export class Game {
  private chess: Chess;
  private plyCount = 0;

  constructor(fen: string = INITIAL_FEN) {
    this.chess = new Chess(fen);
    // chess.js's history length on a freshly-loaded FEN is 0; we just trust the caller's ply.
  }

  static fromFen(fen: string): Game {
    return new Game(fen);
  }

  fen(): string {
    return this.chess.fen();
  }

  turn(): Color {
    return this.chess.turn();
  }

  inCheck(): boolean {
    return this.chess.inCheck();
  }

  legalMovesUci(): string[] {
    return this.chess.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
  }

  legalMovesFromSquare(square: string): string[] {
    return this.chess
      .moves({ square: square as Parameters<Chess['moves']>[0] extends infer T ? string : never, verbose: true } as Parameters<Chess['moves']>[0])
      .map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
  }

  pgn(): string {
    return this.chess.pgn();
  }

  /**
   * Apply a move in UCI form. Throws IllegalMoveError if it's not legal in the current position.
   */
  applyMove(uci: string): MoveResult {
    const parsed = parseUci(uci);
    let result;
    try {
      result = this.chess.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      });
    } catch {
      throw new IllegalMoveError(uci, this.chess.fen());
    }
    if (!result) throw new IllegalMoveError(uci, this.chess.fen());

    this.plyCount += 1;
    return {
      ply: this.plyCount,
      san: result.san,
      uci: `${result.from}${result.to}${result.promotion ?? ''}`,
      fenAfter: this.chess.fen(),
      turn: this.chess.turn(),
      inCheck: this.chess.inCheck(),
      gameOver: detectGameOver(this.chess),
    };
  }
}
