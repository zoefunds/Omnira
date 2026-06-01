'use client';

/**
 * Tiny zero-asset sound engine for chess events. Uses the Web Audio API to
 * synthesize each sound on demand — no .mp3 files, no licensing, no bundle
 * bloat. Each sound is a sub-second envelope of one or two oscillators.
 *
 * Toggle via `useSettings().soundEnabled`.
 */

export type SoundKind =
  | 'move'
  | 'capture'
  | 'castle'
  | 'promote'
  | 'check'
  | 'illegal'
  | 'win'
  | 'loss'
  | 'draw'
  | 'matchStart';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneArgs {
  /** Hz */
  freq: number;
  /** seconds */
  duration: number;
  /** seconds, delay from now */
  startAt?: number;
  /** 0..1 */
  volume?: number;
  type?: OscillatorType;
}

function tone({ freq, duration, startAt = 0, volume = 0.18, type = 'sine' }: ToneArgs) {
  const a = audio();
  if (!a) return;
  // Resume if it was suspended (browsers require a gesture first).
  if (a.state === 'suspended') void a.resume();
  const t0 = a.currentTime + startAt;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Snappy envelope: rise 5 ms, decay over `duration` s, no overhang.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A two-pitch glide (frequency ramps from `from` to `to`). */
function sweep(from: number, to: number, duration: number, volume = 0.18, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  const t0 = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const BANK: Record<SoundKind, () => void> = {
  // Wood-on-wood click — short low triangle, ~80 ms.
  move: () => tone({ freq: 220, duration: 0.08, volume: 0.16, type: 'triangle' }),

  // Sharper, slightly higher hit for captures.
  capture: () => {
    tone({ freq: 330, duration: 0.06, volume: 0.18, type: 'square' });
    tone({ freq: 196, duration: 0.12, startAt: 0.02, volume: 0.14, type: 'triangle' });
  },

  // Castle = two soft clicks in quick succession (king + rook).
  castle: () => {
    tone({ freq: 196, duration: 0.07, volume: 0.14, type: 'triangle' });
    tone({ freq: 262, duration: 0.07, startAt: 0.09, volume: 0.14, type: 'triangle' });
  },

  // Promotion: rising sweep, very short.
  promote: () => sweep(330, 880, 0.22, 0.16, 'sine'),

  // Check: bright two-tone chirp.
  check: () => {
    tone({ freq: 880, duration: 0.09, volume: 0.18, type: 'sine' });
    tone({ freq: 1175, duration: 0.12, startAt: 0.1, volume: 0.18, type: 'sine' });
  },

  // Illegal: low rasp.
  illegal: () => sweep(180, 90, 0.18, 0.18, 'square'),

  // Win: ascending major triad.
  win: () => {
    tone({ freq: 523, duration: 0.18, volume: 0.18, type: 'sine' });
    tone({ freq: 659, duration: 0.18, startAt: 0.12, volume: 0.18, type: 'sine' });
    tone({ freq: 784, duration: 0.32, startAt: 0.24, volume: 0.2, type: 'sine' });
  },

  // Loss: descending minor third.
  loss: () => {
    tone({ freq: 392, duration: 0.22, volume: 0.16, type: 'sine' });
    tone({ freq: 311, duration: 0.32, startAt: 0.18, volume: 0.18, type: 'sine' });
  },

  // Draw: neutral pair.
  draw: () => {
    tone({ freq: 440, duration: 0.18, volume: 0.16, type: 'sine' });
    tone({ freq: 440, duration: 0.24, startAt: 0.16, volume: 0.16, type: 'sine' });
  },

  // Match start: bright trumpet-ish flourish.
  matchStart: () => {
    tone({ freq: 523, duration: 0.1, volume: 0.18, type: 'triangle' });
    tone({ freq: 659, duration: 0.1, startAt: 0.08, volume: 0.18, type: 'triangle' });
    tone({ freq: 784, duration: 0.16, startAt: 0.16, volume: 0.2, type: 'triangle' });
  },
};

/** Play a sound by name. No-ops if the user hasn't enabled audio yet (no user
 *  gesture) — browsers will suspend the AudioContext until that happens. */
export function playSound(kind: SoundKind) {
  try {
    BANK[kind]();
  } catch {
    /* swallow — sounds must never crash the game */
  }
}

/**
 * Prime the AudioContext after a user gesture. Browsers require a gesture
 * before audio will play; call this in a click handler somewhere on the
 * gameplay path (queue-join, accept-challenge) so the first move sound
 * actually fires instead of being silently dropped.
 */
export function primeAudio() {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
}

/** Classify a SAN string into a SoundKind. Falls back to 'move' for normal
 *  quiet moves. */
export function soundForSan(san: string): SoundKind {
  if (!san) return 'move';
  if (san.includes('#')) return 'check'; // checkmate is announced via 'win'/'loss' separately
  if (san.startsWith('O-O') || san.startsWith('0-0')) return 'castle';
  if (san.includes('=')) return 'promote';
  if (san.includes('x')) return 'capture';
  if (san.includes('+')) return 'check';
  return 'move';
}
