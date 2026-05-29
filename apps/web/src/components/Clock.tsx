'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (ms < 10_000) {
    const tenths = Math.max(0, Math.floor((ms % 1000) / 100));
    return `${m}:${r.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface Props {
  /** Server snapshot of this side's remaining time, in ms. */
  remainingMs: number;
  /** Server epoch ms at which the snapshot was taken. */
  tickFrom: number;
  /** Is this side's clock currently ticking? */
  ticking: boolean;
  label: string;
}

export function Clock({ remainingMs, tickFrom, ticking, label }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [ticking]);

  const displayMs = ticking ? Math.max(0, remainingMs - (now - tickFrom)) : remainingMs;
  const low = displayMs < 30_000;

  return (
    <div
      className={clsx(
        'rounded-xl border border-parchment-300 px-4 py-3 flex items-baseline justify-between',
        ticking ? 'bg-parchment-50' : 'bg-parchment-100',
      )}
    >
      <span className="text-xs uppercase tracking-wider text-ink-400">{label}</span>
      <span
        className={clsx(
          'font-mono tabular-nums text-2xl',
          low ? 'text-danger' : 'text-ink-900',
        )}
      >
        {fmt(displayMs)}
      </span>
    </div>
  );
}
