'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Clock, Timer, X } from 'lucide-react';

const TC_PRESETS = [
  { label: '1+0',  initialMs: 60_000,  incrementMs: 0 },
  { label: '3+0',  initialMs: 180_000, incrementMs: 0 },
  { label: '3+2',  initialMs: 180_000, incrementMs: 2_000 },
  { label: '5+3',  initialMs: 300_000, incrementMs: 3_000 },
  { label: '10+5', initialMs: 600_000, incrementMs: 5_000 },
];

const DURATIONS = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '60 min', ms: 60 * 60_000 },
  { label: '90 min', ms: 90 * 60_000 },
  { label: '2 hours', ms: 120 * 60_000 },
];

/** Round "now" up to the next 15-minute mark in UTC, return "HH:MM". */
function nextUtcSlot(): string {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + (15 - (d.getUTCMinutes() % 15)));
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function todayUtcDate(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Convert YYYY-MM-DD + HH:MM (UTC) into ISO. If past, bump by one day. */
function toIsoUtc(dateStr: string, timeStr: string): { iso: string; bumped: boolean } {
  const iso = `${dateStr}T${timeStr}:00.000Z`;
  let t = new Date(iso).getTime();
  let bumped = false;
  if (t < Date.now()) {
    t += 86_400_000; // tomorrow if already past
    bumped = true;
  }
  return { iso: new Date(t).toISOString(), bumped };
}

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateTournamentModal({ onClose, onCreated }: Props) {
  const token = useAuth((s) => s.token);
  const [name, setName] = useState('Saturday Arena');
  const [tc, setTc] = useState(TC_PRESETS[2]!); // 3+2
  const [duration, setDuration] = useState(DURATIONS[1]!); // 60 min
  const [startDate, setStartDate] = useState(todayUtcDate());
  const [startTime, setStartTime] = useState(nextUtcSlot());
  const [rated, setRated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startsAt = useMemo(
    () => toIsoUtc(startDate, startTime),
    [startDate, startTime],
  );
  const startsLocal = useMemo(() => {
    const d = new Date(startsAt.iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [startsAt.iso]);

  async function submit() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createTournament(
        {
          name: name.trim(),
          initialMs: tc.initialMs,
          incrementMs: tc.incrementMs,
          rated,
          startsAt: startsAt.iso,
          durationMs: duration.ms,
        },
        token,
      );
      onCreated(r.tournament.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-parchment-50 border border-parchment-300 rounded-xl shadow-card w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-900 transition"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <p className="text-xs uppercase tracking-[0.25em] text-gold-700">
          Tournament
        </p>
        <h2 className="font-serif text-2xl text-ink-900 mt-1">Create an Arena</h2>

        {/* Name */}
        <label className="block mt-6">
          <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1.5">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400/40 transition"
          />
        </label>

        {/* Time control */}
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">
            Time control
          </div>
          <div className="grid grid-cols-5 gap-2">
            {TC_PRESETS.map((t) => (
              <button
                key={t.label}
                onClick={() => setTc(t)}
                className={`rounded-md border py-2 font-mono text-sm transition ${
                  tc.label === t.label
                    ? 'border-gold-400 bg-parchment-100 text-gold-700'
                    : 'border-parchment-300 bg-parchment-50 text-ink-600 hover:border-gold-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration + Start time (UTC) */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 inline-flex items-center gap-1.5">
              <Timer size={12} strokeWidth={1.5} />
              Duration
            </div>
            <select
              value={duration.ms}
              onChange={(e) =>
                setDuration(
                  DURATIONS.find((d) => d.ms === Number(e.target.value)) ??
                    DURATIONS[1]!,
                )
              }
              className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-gold-400"
            >
              {DURATIONS.map((d) => (
                <option key={d.label} value={d.ms}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 inline-flex items-center gap-1.5">
              <Clock size={12} strokeWidth={1.5} />
              Starts at (UTC)
            </div>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value || '12:00')}
              className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-gold-400 font-mono"
            />
          </div>
        </div>

        {/* Date */}
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-1.5">
            Date (UTC)
          </div>
          <input
            type="date"
            value={startDate}
            min={todayUtcDate()}
            onChange={(e) => setStartDate(e.target.value || todayUtcDate())}
            className="w-full rounded-md bg-parchment-100 border border-parchment-300 px-3 py-2 text-sm outline-none focus:border-gold-400 font-mono"
          />
          <div className="mt-2 text-[11px] text-ink-400">
            Your local time:{' '}
            <span className="text-ink-600">{startsLocal}</span>
          </div>
          {startsAt.bumped && (
            <div className="mt-2 rounded-md border border-gold-300 bg-parchment-50 px-3 py-2 text-[11px] text-gold-700 leading-snug">
              That time has already passed today (UTC), so it&apos;s been
              scheduled for tomorrow.
            </div>
          )}
        </div>

        {/* Mode */}
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">
            Mode
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRated(true)}
              className={`rounded-md border py-2 text-sm transition ${
                rated
                  ? 'border-gold-400 bg-parchment-100 text-gold-700'
                  : 'border-parchment-300 bg-parchment-50 text-ink-600 hover:border-gold-300'
              }`}
            >
              Rated
            </button>
            <button
              onClick={() => setRated(false)}
              className={`rounded-md border py-2 text-sm transition ${
                !rated
                  ? 'border-gold-400 bg-parchment-100 text-gold-700'
                  : 'border-parchment-300 bg-parchment-50 text-ink-600 hover:border-gold-300'
              }`}
            >
              Casual
            </button>
          </div>
        </div>

        {err && <p className="mt-4 text-sm text-danger">{err}</p>}

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || name.trim().length < 3}
            className="rounded-md bg-gold-shine px-5 py-2 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? 'Creating.' : 'Create arena'}
          </button>
        </div>
      </div>
    </div>
  );
}
