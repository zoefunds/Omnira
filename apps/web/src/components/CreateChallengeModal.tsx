'use client';

import { useState } from 'react';
import { api, type ChallengeColor } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from './Button';

const TC_PRESETS = [
  { label: '1+0',  initialMs: 60_000,    incrementMs: 0 },
  { label: '3+0',  initialMs: 180_000,   incrementMs: 0 },
  { label: '3+2',  initialMs: 180_000,   incrementMs: 2_000 },
  { label: '5+3',  initialMs: 300_000,   incrementMs: 3_000 },
  { label: '10+5', initialMs: 600_000,   incrementMs: 5_000 },
  { label: '30+0', initialMs: 1_800_000, incrementMs: 0 },
];

interface Props {
  onClose: () => void;
  onCreated: (code: string, isPublic: boolean) => void;
}

export function CreateChallengeModal({ onClose, onCreated }: Props) {
  const token = useAuth((s) => s.token);
  const [tc, setTc] = useState(TC_PRESETS[3]!); // 5+3
  const [color, setColor] = useState<ChallengeColor>('RANDOM');
  const [rated, setRated] = useState(true);
  const [isPublic, setPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.createChallenge({
        initialMs: tc.initialMs,
        incrementMs: tc.incrementMs,
        colorPreference: color,
        rated,
        isPublic,
      }, token);
      onCreated(r.challenge.code, r.challenge.isPublic);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-soft w-full max-w-md p-6"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-2xl text-ink-900">Create a game</h2>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Time control</div>
          <div className="grid grid-cols-3 gap-2">
            {TC_PRESETS.map((t) => (
              <button key={t.label} onClick={() => setTc(t)}
                className={`rounded-xl border p-2 font-mono text-sm transition ${
                  tc.label === t.label
                    ? 'border-accent bg-parchment-100 text-ink-900'
                    : 'border-parchment-300 bg-parchment-50 text-ink-600 hover:bg-parchment-100'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Color</div>
            <div className="flex gap-1">
              {(['WHITE','RANDOM','BLACK'] as ChallengeColor[]).map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`flex-1 rounded-xl border py-1.5 text-xs transition ${
                    color === c ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'
                  }`}>{c[0] + c.slice(1).toLowerCase()}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Mode</div>
            <div className="flex gap-1">
              <button onClick={() => setRated(true)}
                className={`flex-1 rounded-xl border py-1.5 text-xs transition ${rated ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>Rated</button>
              <button onClick={() => setRated(false)}
                className={`flex-1 rounded-xl border py-1.5 text-xs transition ${!rated ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>Casual</button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Visibility</div>
          <div className="flex gap-1">
            <button onClick={() => setPublic(true)}
              className={`flex-1 rounded-xl border py-1.5 text-xs transition ${isPublic ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>
              Public (lobby)
            </button>
            <button onClick={() => setPublic(false)}
              className={`flex-1 rounded-xl border py-1.5 text-xs transition ${!isPublic ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>
              Private (share link)
            </button>
          </div>
        </div>

        {err && <p className="mt-4 text-sm text-danger">{err}</p>}

        <div className="mt-6 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
        </div>
      </div>
    </div>
  );
}
