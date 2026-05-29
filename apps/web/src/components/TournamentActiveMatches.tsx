'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api, type ApiActiveTournamentMatch } from '@/lib/api';

const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), { ssr: false });

interface Props { tournamentId: string; }

export function TournamentActiveMatches({ tournamentId }: Props) {
  const [matches, setMatches] = useState<ApiActiveTournamentMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api.listActiveMatches(tournamentId);
        if (!cancelled) setMatches(r.matches);
      } catch {/* ignore */}
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, 2_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [tournamentId]);

  if (matches.length === 0) return null;

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Games in progress</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {matches.map((m) => (
          <div key={m.id} className="rounded-xl border border-parchment-300 bg-parchment-50 p-2">
            <div className="aspect-square overflow-hidden rounded-lg">
              <Chessboard
                position={m.currentFen ?? undefined}
                arePiecesDraggable={false}
                customBoardStyle={{ borderRadius: '0.5rem' }}
                customDarkSquareStyle={{ backgroundColor: '#a89f7b' }}
                customLightSquareStyle={{ backgroundColor: '#f1ecd9' }}
              />
            </div>
            <div className="mt-2 text-[11px] text-ink-600 leading-tight flex items-baseline justify-between gap-1">
              <div className="min-w-0 truncate">
                <div className="truncate">{m.blackPlayer.username}</div>
                <div className="truncate text-ink-900">{m.whitePlayer.username}</div>
              </div>
              <span className="font-mono text-ink-400 text-[10px]">ply {m.ply}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
