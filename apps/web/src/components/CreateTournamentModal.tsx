'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from './Button';

const TC_PRESETS = [
  { label: '1+0', initialMs: 60_000,    incrementMs: 0 },
  { label: '3+0', initialMs: 180_000,   incrementMs: 0 },
  { label: '3+2', initialMs: 180_000,   incrementMs: 2_000 },
  { label: '5+3', initialMs: 300_000,   incrementMs: 3_000 },
  { label: '10+5', initialMs: 600_000,  incrementMs: 5_000 },
];

const DURATIONS = [
  { label: '30 min',  ms: 30 * 60_000 },
  { label: '60 min',  ms: 60 * 60_000 },
  { label: '90 min',  ms: 90 * 60_000 },
  { label: '2 hours', ms: 120 * 60_000 },
];

function isoIn(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

interface Props { onClose: () => void; onCreated: (id: string) => void; }

export function CreateTournamentModal({ onClose, onCreated }: Props) {
  const token = useAuth((s) => s.token);
  const [name, setName] = useState('Saturday Arena');
  const [tc, setTc] = useState(TC_PRESETS[2]!); // 3+2
  const [duration, setDuration] = useState(DURATIONS[1]!); // 60 min
  const [startInMin, setStartInMin] = useState(5);
  const [rated, setRated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.createTournament({
        name: name.trim(),
        initialMs: tc.initialMs,
        incrementMs: tc.incrementMs,
        rated,
        startsAt: isoIn(startInMin),
        durationMs: duration.ms,
      }, token);
      onCreated(r.tournament.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-soft w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-2xl text-ink-900">Create an Arena</h2>

        <label className="block mt-5">
          <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            className="w-full rounded-xl bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Time control</div>
          <div className="grid grid-cols-5 gap-2">
            {TC_PRESETS.map((t) => (
              <button key={t.label} onClick={() => setTc(t)}
                className={`rounded-xl border p-2 font-mono text-sm transition ${tc.label === t.label ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Duration</div>
            <select value={duration.ms} onChange={(e) => setDuration(DURATIONS.find((d) => d.ms === Number(e.target.value)) ?? DURATIONS[1]!)}
              className="w-full rounded-xl bg-parchment-100 border border-parchment-300 px-3 py-1.5 text-sm">
              {DURATIONS.map((d) => <option key={d.label} value={d.ms}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Starts in</div>
            <select value={startInMin} onChange={(e) => setStartInMin(Number(e.target.value))}
              className="w-full rounded-xl bg-parchment-100 border border-parchment-300 px-3 py-1.5 text-sm">
              {[2, 5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Mode</div>
          <div className="flex gap-1">
            <button onClick={() => setRated(true)}
              className={`flex-1 rounded-xl border py-1.5 text-xs transition ${rated ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>Rated</button>
            <button onClick={() => setRated(false)}
              className={`flex-1 rounded-xl border py-1.5 text-xs transition ${!rated ? 'border-accent bg-parchment-100' : 'border-parchment-300 bg-parchment-50 hover:bg-parchment-100'}`}>Casual</button>
          </div>
        </div>

        {err && <p className="mt-4 text-sm text-danger">{err}</p>}

        <div className="mt-6 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 3}>{busy ? 'Creating…' : 'Create arena'}</Button>
        </div>
      </div>
    </div>
  );
}
