'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api, type ApiSiteActiveMatch } from '@/lib/api';
import { Eye, Radio, Timer, Zap, Gauge } from 'lucide-react';

const Chessboard = dynamic(
  () => import('react-chessboard').then((m) => m.Chessboard),
  { ssr: false },
);

function fmtTC(initialSec: number, incrementSec: number) {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}

type Filter = 'all' | 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';

export default function WatchPage() {
  const [matches, setMatches] = useState<ApiSiteActiveMatch[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api.listActiveSiteMatches();
        if (!cancelled) setMatches(r.matches);
      } catch {
        /* ignore */
      }
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return matches;
    return matches.filter((m) => m.category === filter);
  }, [matches, filter]);

  const counts = useMemo(() => {
    return {
      all: matches.length,
      BULLET: matches.filter((m) => m.category === 'BULLET').length,
      BLITZ: matches.filter((m) => m.category === 'BLITZ').length,
      RAPID: matches.filter((m) => m.category === 'RAPID').length,
      CLASSICAL: matches.filter((m) => m.category === 'CLASSICAL').length,
    };
  }, [matches]);

  const filterDefs: Array<{
    id: Filter;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'all', label: 'All', icon: <Eye size={14} strokeWidth={1.5} /> },
    { id: 'BULLET', label: 'Bullet', icon: <Gauge size={14} strokeWidth={1.5} /> },
    { id: 'BLITZ', label: 'Blitz', icon: <Zap size={14} strokeWidth={1.5} /> },
    { id: 'RAPID', label: 'Rapid', icon: <Timer size={14} strokeWidth={1.5} /> },
    { id: 'CLASSICAL', label: 'Classical', icon: <Timer size={14} strokeWidth={1.5} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Live Spectator
          </p>
          <h1 className="font-serif text-4xl text-ink-900">Watch</h1>
          <p className="mt-2 text-sm text-ink-600 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-shine" />
            </span>
            {matches.length} live games across Omnira
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-md bg-parchment-100/60 border border-parchment-300 px-3 py-2 text-xs text-ink-600">
          <Radio size={14} className="text-gold-600" strokeWidth={1.5} />
          Refreshes every 2 seconds
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filterDefs.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition ${
                active
                  ? 'border-gold-400 bg-parchment-50 text-gold-700 shadow-soft'
                  : 'border-parchment-300 bg-parchment-100/60 text-ink-600 hover:border-gold-300'
              }`}
            >
              {f.icon}
              {f.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                  active
                    ? 'bg-gold-shine text-parchment-50'
                    : 'bg-parchment-200 text-ink-400'
                }`}
              >
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-16 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gold-shine flex items-center justify-center shadow-soft">
            <Eye size={26} className="text-parchment-50" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-serif text-2xl text-ink-900">
            The board is quiet
          </h2>
          <p className="mt-2 text-sm text-ink-600 max-w-md mx-auto">
            No games in progress right now. As soon as a match begins, it will
            appear here. Open a game yourself to start the action.
          </p>
          <Link
            href="/lobby"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
          >
            Find a match
          </Link>
        </div>
      )}

      {/* Live grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={`/watch/${m.id}`}
              className="group block rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card hover:border-gold-300 hover:shadow-gold transition overflow-hidden"
            >
              {/* Black header (top player) */}
              <div className="px-3 py-2 bg-ink-900/95 text-parchment-100 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-parchment-100" />
                  <span className="text-xs truncate">
                    {m.blackPlayer.username}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-parchment-300">
                  Black
                </span>
              </div>

              {/* Board */}
              <div className="aspect-square">
                <Chessboard
                  position={m.currentFen ?? undefined}
                  arePiecesDraggable={false}
                  customBoardStyle={{ borderRadius: 0 }}
                  customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
                  customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
                />
              </div>

              {/* White footer */}
              <div className="px-3 py-2 bg-parchment-50 border-t border-parchment-300 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-ink-900" />
                  <span className="text-xs text-ink-900 font-medium truncate group-hover:text-gold-700 transition">
                    {m.whitePlayer.username}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-ink-400">
                  White
                </span>
              </div>

              {/* Meta row */}
              <div className="px-3 py-2 border-t border-parchment-300 flex items-center justify-between text-[11px]">
                <span className="font-mono text-ink-600">
                  {fmtTC(m.initialTimeSec, m.incrementSec)}
                </span>
                <span className="uppercase tracking-wider text-ink-400">
                  {m.category.toLowerCase()}
                </span>
                <span className="font-mono text-ink-400">ply {m.ply}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
