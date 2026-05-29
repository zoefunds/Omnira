'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api, type ApiSiteActiveMatch } from '@/lib/api';

const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), { ssr: false });

function fmtTC(initialSec: number, incrementSec: number) {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}

export default function WatchPage() {
  const [matches, setMatches] = useState<ApiSiteActiveMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api.listActiveSiteMatches();
        if (!cancelled) setMatches(r.matches);
      } catch {/* ignore */}
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, 2_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Watch</h1>
          <p className="text-sm text-ink-600">Live games across Omnira · {matches.length} in progress</p>
        </div>
      </header>

      {matches.length === 0 && (
        <div className="rounded-xl border border-parchment-300 bg-parchment-100 p-6 text-sm text-ink-400">
          No games in progress right now.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {matches.map((m) => (
          <Link key={m.id} href={`/watch/${m.id}`}
            className="block rounded-xl border border-parchment-300 bg-parchment-50 p-2 hover:bg-parchment-100 transition">
            <div className="aspect-square overflow-hidden rounded-lg">
              <Chessboard
                position={m.currentFen ?? undefined}
                arePiecesDraggable={false}
                customBoardStyle={{ borderRadius: '0.5rem' }}
                customDarkSquareStyle={{ backgroundColor: '#a89f7b' }}
                customLightSquareStyle={{ backgroundColor: '#f1ecd9' }}
              />
            </div>
            <div className="mt-2 text-xs text-ink-600 leading-tight">
              <div className="truncate">{m.blackPlayer.username}</div>
              <div className="truncate text-ink-900">{m.whitePlayer.username}</div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="font-mono text-ink-400">{fmtTC(m.initialTimeSec, m.incrementSec)} · {m.category.toLowerCase()}</span>
                <span className="font-mono text-ink-400">ply {m.ply}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
