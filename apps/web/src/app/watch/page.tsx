'use client';

import { useEffect, useState } from 'react';
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

const PAGE_SIZE = 24;

export default function WatchPage() {
  const [matches, setMatches] = useState<ApiSiteActiveMatch[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Reset to page 1 whenever the filter changes.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api.listActiveSiteMatches({
          page,
          pageSize: PAGE_SIZE,
          category: filter === 'all' ? undefined : filter,
        });
        if (cancelled) return;
        setMatches(r.matches);
        setTotal(r.total);
        setHasMore(r.hasMore);
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
  }, [page, filter]);

  // Server returns matches already filtered + paginated; pass through.
  const filtered = matches;

  const [counts, setCounts] = useState({
    all: 0,
    BULLET: 0,
    BLITZ: 0,
    RAPID: 0,
    CLASSICAL: 0,
  });
  // Cheap polling per-category count so filter chips show live numbers.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const [all, bullet, blitz, rapid, classical] = await Promise.all([
          api.listActiveSiteMatches({ pageSize: 1 }),
          api.listActiveSiteMatches({ pageSize: 1, category: 'BULLET' }),
          api.listActiveSiteMatches({ pageSize: 1, category: 'BLITZ' }),
          api.listActiveSiteMatches({ pageSize: 1, category: 'RAPID' }),
          api.listActiveSiteMatches({ pageSize: 1, category: 'CLASSICAL' }),
        ]);
        if (!cancelled) {
          setCounts({
            all: all.total,
            BULLET: bullet.total,
            BLITZ: blitz.total,
            RAPID: rapid.total,
            CLASSICAL: classical.total,
          });
        }
      } catch {
        /* ignore */
      }
    };
    void pull();
    const id = setInterval(pull, 4_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Live Spectator
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink-900">Watch</h1>
          <p className="mt-2 text-sm text-ink-600 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-shine" />
            </span>
            {counts.all} live games across Omnira
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

      {/* Pager — only shows when there's more than one page of results */}
      {filtered.length > 0 && (page > 1 || hasMore) && (
        <div className="mt-8 flex items-center justify-between text-sm">
          <span className="text-ink-400">
            Page {page}
            {total > 0 && <> · {total} {total === 1 ? 'match' : 'matches'}</>}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md bg-gold-shine px-4 py-2 text-sm font-medium text-parchment-50 shadow-soft hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
