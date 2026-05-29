'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { API_BASE } from '@/lib/config';
import { useMatch } from '@/store/match';
import { useAnalysis, type MoveClass, type PerMove, type EngineReport } from '@/store/analysis';

const DOT: Record<MoveClass, string> = {
  good:       'bg-accent',
  book:       'bg-parchment-500',
  inaccuracy: 'bg-amber-400',
  mistake:    'bg-orange-500',
  blunder:    'bg-danger',
};

const LABEL: Record<MoveClass, string> = {
  good: 'good', book: 'book',
  inaccuracy: 'inaccuracy', mistake: 'mistake', blunder: 'blunder',
};

function fmtEval(cp: number | null, mate: number | null): string {
  if (mate != null) return `#${mate}`;
  if (cp == null) return '—';
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

function AccuracyBar({ label, pct }: { label: string; pct: number }) {
  const rounded = Math.round(pct);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-ink-400 mb-1">
        <span>{label}</span>
        <span className="font-mono text-ink-900">{rounded}</span>
      </div>
      <div className="h-1.5 rounded-full bg-parchment-300 overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${rounded}%` }} />
      </div>
    </div>
  );
}

function Counts({ title, counts }: { title: string; counts: Record<MoveClass, number> }) {
  const order: MoveClass[] = ['good', 'book', 'inaccuracy', 'mistake', 'blunder'];
  return (
    <div className="text-xs">
      <div className="text-ink-400 mb-1">{title}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={clsx('h-2 w-2 rounded-full', DOT[k])} />
            <span className="text-ink-600">{LABEL[k]}</span>
            <span className="font-mono text-ink-900">{counts[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveRow({ m }: { m: PerMove }) {
  const isWhite = m.ply % 2 === 1;
  return (
    <li className="flex items-center gap-2 text-sm py-0.5">
      <span className={clsx('h-2 w-2 rounded-full shrink-0', DOT[m.classification])} />
      <span className="w-6 text-right font-mono text-ink-400 text-xs">{m.ply}.</span>
      <span className="w-14 font-mono text-ink-900">{m.san}</span>
      <span className="w-12 font-mono text-xs text-ink-400">
        {fmtEval(m.evalAfterCp, m.evalAfterMate)}
      </span>
      <span className="flex-1 text-xs text-ink-400 truncate">
        {m.classification !== 'good' && m.classification !== 'book' && m.bestMoveSan !== m.san && (
          <>best: <span className="text-ink-900 font-mono">{m.bestMoveSan}</span>
          {m.cpLoss != null && <> · −{(m.cpLoss/100).toFixed(2)}</>}
          </>
        )}
        {(m.classification === 'good' || m.classification === 'book') && (
          <span>{isWhite ? 'white' : 'black'}</span>
        )}
      </span>
    </li>
  );
}

export function AnalysisPanel() {
  const matchId = useMatch((s) => s.matchId);
  const ended = useMatch((s) => s.ended);
  const report = useAnalysis((s) => (matchId ? s.byMatch[matchId] : undefined));
  const setReport = useAnalysis((s) => s.set);
  const [status, setStatus] = useState<'idle' | 'pending' | 'ready' | 'error'>('idle');

  // Poll the API until report is available (after game ends).
  useEffect(() => {
    if (!matchId || !ended || report) return;
    let stopped = false;
    let attempts = 0;
    setStatus('pending');
    const tick = async () => {
      attempts += 1;
      try {
        const res = await fetch(`${API_BASE}/match/${matchId}/analysis`);
        if (res.ok) {
          const j = await res.json();
          if (!stopped) {
            setReport(matchId, j);
            setStatus('ready');
          }
          return;
        }
        if (res.status !== 404 && !stopped) setStatus('error');
      } catch {
        /* keep polling */
      }
      if (!stopped && attempts < 60) setTimeout(tick, 5_000); // up to 5 min
    };
    void tick();
    return () => { stopped = true; };
  }, [matchId, ended, report, setReport]);

  if (!matchId) return null;

  if (!ended) {
    return (
      <div className="text-sm text-ink-400">
        Analysis becomes available once the game ends.
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-sm text-ink-600 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        {status === 'error' ? 'Failed to load analysis.' : 'Computing engine analysis…'}
      </div>
    );
  }

  const eng = report.engineReport as EngineReport;
  if ('error' in eng) {
    return (
      <div className="text-sm text-danger">
        Analysis failed: <span className="text-ink-900">{eng.error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[24rem]">
      <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
        <AccuracyBar label="White accuracy" pct={eng.whiteAccuracy} />
        <AccuracyBar label="Black accuracy" pct={eng.blackAccuracy} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Counts title="White" counts={eng.whiteCounts} />
          <Counts title="Black" counts={eng.blackCounts} />
        </div>
        <div className="mt-2 text-[10px] text-ink-400">
          depth {eng.depth} · {eng.perMove.length} plies
        </div>
      </div>

      <ol className="overflow-y-auto pr-1">
        {eng.perMove.map((m) => <MoveRow key={m.ply} m={m} />)}
      </ol>
    </div>
  );
}
