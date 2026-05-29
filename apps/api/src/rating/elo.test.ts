import { describe, it, expect } from 'vitest';
import { applyElo } from './elo.js';

describe('Elo', () => {
  it('equal players: winner gains, loser loses, sum = 0', () => {
    const r = applyElo({ rating: 1500, gamesPlayed: 100 }, { rating: 1500, gamesPlayed: 100 }, 'WHITE_WON');
    expect(r.whiteDelta).toBe(16);
    expect(r.blackDelta).toBe(-16);
  });

  it('equal players: draw is 0/0', () => {
    const r = applyElo({ rating: 1500, gamesPlayed: 100 }, { rating: 1500, gamesPlayed: 100 }, 'DRAW');
    expect(r.whiteDelta).toBe(0);
    expect(r.blackDelta).toBe(0);
  });

  it('upset: lower rated beats higher rated → big gain', () => {
    const r = applyElo({ rating: 1200, gamesPlayed: 100 }, { rating: 1800, gamesPlayed: 100 }, 'WHITE_WON');
    expect(r.whiteDelta).toBeGreaterThan(20);
    expect(r.blackDelta).toBeLessThan(-20);
  });

  it('provisional player has higher K-factor', () => {
    const a = applyElo({ rating: 1500, gamesPlayed: 5 }, { rating: 1500, gamesPlayed: 100 }, 'WHITE_WON');
    const b = applyElo({ rating: 1500, gamesPlayed: 100 }, { rating: 1500, gamesPlayed: 100 }, 'WHITE_WON');
    expect(a.whiteDelta).toBeGreaterThan(b.whiteDelta);
  });
});
