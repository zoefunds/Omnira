import { describe, it, expect } from 'vitest';
import { Game, INITIAL_FEN, IllegalMoveError } from './engine.js';

describe('Game basic play', () => {
  it('starts from the initial position with white to move', () => {
    const g = new Game();
    expect(g.fen()).toBe(INITIAL_FEN);
    expect(g.turn()).toBe('w');
    expect(g.inCheck()).toBe(false);
  });

  it('accepts a legal opening move and updates turn', () => {
    const g = new Game();
    const r = g.applyMove('e2e4');
    expect(r.san).toBe('e4');
    expect(r.uci).toBe('e2e4');
    expect(r.turn).toBe('b');
    expect(r.gameOver).toBeNull();
  });

  it('rejects an illegal move', () => {
    const g = new Game();
    expect(() => g.applyMove('e2e5')).toThrow(IllegalMoveError);
  });

  it('detects fool\'s mate (checkmate after 4 plies)', () => {
    const g = new Game();
    g.applyMove('f2f3');
    g.applyMove('e7e5');
    g.applyMove('g2g4');
    const r = g.applyMove('d8h4');
    expect(r.gameOver).toEqual({ outcome: 'BLACK_WON', reason: 'CHECKMATE' });
    expect(r.san).toBe('Qh4#');
  });

  it('handles castling (kingside, white)', () => {
    // Fast path to allow O-O: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O
    const g = new Game();
    g.applyMove('e2e4');
    g.applyMove('e7e5');
    g.applyMove('g1f3');
    g.applyMove('b8c6');
    g.applyMove('f1c4');
    g.applyMove('f8c5');
    const r = g.applyMove('e1g1');
    expect(r.san).toBe('O-O');
  });

  it('handles en passant', () => {
    // 1.e4 a6 2.e5 d5 3.exd6 (en passant)
    const g = new Game();
    g.applyMove('e2e4');
    g.applyMove('a7a6');
    g.applyMove('e4e5');
    g.applyMove('d7d5');
    const r = g.applyMove('e5d6');
    expect(r.san).toBe('exd6');
  });

  it('handles promotion', () => {
    // Use a FEN where promotion is one move away
    const g = Game.fromFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const r = g.applyMove('a7a8q');
    expect(r.san).toBe('a8=Q+'); // promotion gives check on the a-file
  });

  it('detects insufficient material (K vs K)', () => {
    const g = Game.fromFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    // Force any waiting move to trigger draw detection
    const r = g.applyMove('e1d1');
    expect(r.gameOver?.reason).toBe('INSUFFICIENT_MATERIAL');
  });

  it('legalMovesUci returns 20 moves from the start position', () => {
    const g = new Game();
    expect(g.legalMovesUci()).toHaveLength(20);
  });
});
