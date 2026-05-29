import { describe, it, expect } from 'vitest';
import {
  newClock,
  startClock,
  onMove,
  remainingMs,
  isFlagged,
  stopClock,
  classify,
  TIME_CONTROL_PRESETS,
} from './clock.js';

const blitz5plus3 = TIME_CONTROL_PRESETS['5+3']!;

describe('clock', () => {
  it('starts paused with full time both sides', () => {
    const c = newClock(blitz5plus3);
    expect(c.whiteMs).toBe(300_000);
    expect(c.blackMs).toBe(300_000);
    expect(c.turn).toBe('w');
    expect(c.turnStartedAt).toBeNull();
  });

  it('first move does not deduct time, increment is NOT applied to mover (Fischer common rule), turn switches', () => {
    let c = newClock(blitz5plus3);
    c = startClock(c, 1000);
    const { next, thinkMs } = onMove(c, blitz5plus3, 1500);
    expect(thinkMs).toBe(0); // first-move grace
    expect(next.whiteMs).toBe(300_000);
    expect(next.turn).toBe('b');
  });

  it('subsequent moves deduct think time and add increment to mover', () => {
    let c = newClock(blitz5plus3);
    c = startClock(c, 0);
    // White moves at t=2000 (took 2s)
    let r = onMove(c, blitz5plus3, 2000);
    c = r.next;
    // Black moves at t=5000 (took 3s) — black should lose 3s and gain 3s increment → net 0
    r = onMove(c, blitz5plus3, 5000);
    expect(r.thinkMs).toBe(3000);
    expect(r.blackMs).toBe(300_000); // 300000 - 3000 + 3000
    expect(r.next.turn).toBe('w');
  });

  it('remainingMs accounts for elapsed time on the ticking clock', () => {
    let c = newClock(blitz5plus3);
    c = startClock(c, 0);
    const r = remainingMs(c, 4000);
    expect(r.whiteMs).toBe(296_000);
    expect(r.blackMs).toBe(300_000);
  });

  it('isFlagged returns the side that ran out', () => {
    const c = startClock(newClock({ ...blitz5plus3, initialMs: 1000 }), 0);
    expect(isFlagged(c, 999)).toBeNull();
    expect(isFlagged(c, 1500)).toBe('w');
  });

  it('classify groups time controls correctly', () => {
    expect(classify(60_000, 0)).toBe('BULLET');
    expect(classify(180_000, 0)).toBe('BLITZ');
    expect(classify(600_000, 5_000)).toBe('RAPID');
    expect(classify(1_800_000, 20_000)).toBe('CLASSICAL');
  });

  it('stopClock freezes remaining times', () => {
    const c = startClock(newClock(blitz5plus3), 0);
    const stopped = stopClock(c, 10_000);
    expect(stopped.whiteMs).toBe(290_000);
    expect(stopped.turnStartedAt).toBeNull();
  });
});
