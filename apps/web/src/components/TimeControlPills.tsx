'use client';

import { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Button } from './Button';
import { useMatch } from '@/store/match';
import { primeAudio } from '@/lib/sounds';

const TC = [
  { label: '1+0',  initialMs: 60_000,    incrementMs: 0,     category: 'Bullet' },
  { label: '3+0',  initialMs: 180_000,   incrementMs: 0,     category: 'Blitz'  },
  { label: '3+2',  initialMs: 180_000,   incrementMs: 2_000, category: 'Blitz'  },
  { label: '5+3',  initialMs: 300_000,   incrementMs: 3_000, category: 'Blitz'  },
  { label: '10+5', initialMs: 600_000,   incrementMs: 5_000, category: 'Rapid'  },
  { label: '30+0', initialMs: 1_800_000, incrementMs: 0,     category: 'Classical' },
];

export function TimeControlPills({ socket }: { socket: Socket }) {
  const queueStatus = useMatch((s) => s.queueStatus);
  const setQueueStatus = useMatch((s) => s.setQueueStatus);
  const [chosen, setChosen] = useState<(typeof TC)[number] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function join(tc: (typeof TC)[number]) {
    setErr(null);
    setChosen(tc);
    setQueueStatus('waiting');
    primeAudio(); // unlock audio while we still have a user gesture
    socket.emit('queue:join',
      { initialMs: tc.initialMs, incrementMs: tc.incrementMs },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) { setErr(ack.error ?? 'failed'); setQueueStatus('idle'); }
      });
  }
  function cancel() {
    if (!chosen) return;
    socket.emit('queue:leave',
      { initialMs: chosen.initialMs, incrementMs: chosen.incrementMs },
      () => { setQueueStatus('idle'); setChosen(null); });
  }

  if (queueStatus === 'waiting' && chosen) {
    return (
      <div className="rounded-xl border border-parchment-300 bg-parchment-100 p-5">
        <div className="text-sm text-ink-400">Searching for an opponent</div>
        <div className="mt-1 font-serif text-xl text-ink-900">
          {chosen.category} · {chosen.label}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="text-sm text-ink-600">Matching by rating…</span>
        </div>
        <Button variant="ghost" className="mt-4" onClick={cancel}>Cancel</Button>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-serif text-xl text-ink-900 mb-3">Quick pairing</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {TC.map((tc) => (
          <button key={tc.label}
            onClick={() => join(tc)}
            className="rounded-xl border border-parchment-300 bg-parchment-100 hover:bg-parchment-50 transition p-3 text-left shadow-soft">
            <div className="text-[10px] uppercase tracking-wider text-ink-400">{tc.category}</div>
            <div className="mt-0.5 font-mono text-xl text-ink-900">{tc.label}</div>
          </button>
        ))}
      </div>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
    </div>
  );
}
