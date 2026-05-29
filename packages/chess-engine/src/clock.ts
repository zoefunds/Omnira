import type { ClockState, TimeControl, TimeControlCategory, Color } from './types.js';

export const TIME_CONTROL_PRESETS: Record<string, TimeControl> = {
  // Bullet
  '1+0':   { category: 'BULLET',    initialMs:  60_000, incrementMs:     0 },
  '2+1':   { category: 'BULLET',    initialMs: 120_000, incrementMs: 1_000 },
  // Blitz
  '3+0':   { category: 'BLITZ',     initialMs: 180_000, incrementMs:     0 },
  '3+2':   { category: 'BLITZ',     initialMs: 180_000, incrementMs: 2_000 },
  '5+0':   { category: 'BLITZ',     initialMs: 300_000, incrementMs:     0 },
  '5+3':   { category: 'BLITZ',     initialMs: 300_000, incrementMs: 3_000 },
  // Rapid
  '10+0':  { category: 'RAPID',     initialMs: 600_000, incrementMs:     0 },
  '10+5':  { category: 'RAPID',     initialMs: 600_000, incrementMs: 5_000 },
  '15+10': { category: 'RAPID',     initialMs: 900_000, incrementMs:10_000 },
  // Classical
  '30+0':  { category: 'CLASSICAL', initialMs: 1_800_000, incrementMs:    0 },
  '30+20': { category: 'CLASSICAL', initialMs: 1_800_000, incrementMs:20_000 },
};

/** Classify any (initial, increment) pair the way Lichess does. */
export function classify(initialMs: number, incrementMs: number): TimeControlCategory {
  // Estimated game time = initial + 40 * increment (Lichess heuristic).
  const estimate = initialMs + 40 * incrementMs;
  if (estimate < 180_000) return 'BULLET';
  if (estimate < 480_000) return 'BLITZ';
  if (estimate < 1_500_000) return 'RAPID';
  return 'CLASSICAL';
}

export function newClock(tc: TimeControl): ClockState {
  return {
    whiteMs: tc.initialMs,
    blackMs: tc.initialMs,
    turn: 'w',
    turnStartedAt: null,
  };
}

/** Call when the game actually starts (both players present). */
export function startClock(state: ClockState, now: number): ClockState {
  return { ...state, turnStartedAt: now };
}

/** Pure helper: how much time the side-to-move has remaining right now. */
export function remainingMs(state: ClockState, now: number): { whiteMs: number; blackMs: number } {
  if (state.turnStartedAt == null) {
    return { whiteMs: state.whiteMs, blackMs: state.blackMs };
  }
  const elapsed = Math.max(0, now - state.turnStartedAt);
  if (state.turn === 'w') {
    return { whiteMs: Math.max(0, state.whiteMs - elapsed), blackMs: state.blackMs };
  }
  return { whiteMs: state.whiteMs, blackMs: Math.max(0, state.blackMs - elapsed) };
}

/** Has the side-to-move flagged (run out of time)? */
export function isFlagged(state: ClockState, now: number): Color | null {
  const r = remainingMs(state, now);
  if (state.turn === 'w' && r.whiteMs <= 0) return 'w';
  if (state.turn === 'b' && r.blackMs <= 0) return 'b';
  return null;
}

/** Apply a move at time `now`: deduct thinking time from mover, add increment, switch turn. */
export function onMove(
  state: ClockState,
  tc: TimeControl,
  now: number,
): { next: ClockState; thinkMs: number; whiteMs: number; blackMs: number } {
  if (state.turnStartedAt == null) {
    // First move of the game — treat as zero think time.
    const next: ClockState = {
      ...state,
      turn: state.turn === 'w' ? 'b' : 'w',
      turnStartedAt: now,
    };
    return { next, thinkMs: 0, whiteMs: next.whiteMs, blackMs: next.blackMs };
  }

  const thinkMs = Math.max(0, now - state.turnStartedAt);
  let whiteMs = state.whiteMs;
  let blackMs = state.blackMs;
  if (state.turn === 'w') {
    whiteMs = Math.max(0, whiteMs - thinkMs) + tc.incrementMs;
  } else {
    blackMs = Math.max(0, blackMs - thinkMs) + tc.incrementMs;
  }
  const next: ClockState = {
    whiteMs,
    blackMs,
    turn: state.turn === 'w' ? 'b' : 'w',
    turnStartedAt: now,
  };
  return { next, thinkMs, whiteMs, blackMs };
}

/** Freeze the clock at game end. */
export function stopClock(state: ClockState, now: number): ClockState {
  const r = remainingMs(state, now);
  return { whiteMs: r.whiteMs, blackMs: r.blackMs, turn: state.turn, turnStartedAt: null };
}
