'use client';

import type { ApiTournamentPlayer } from '@/lib/api';

export function TournamentPodium({ standings }: { standings: ApiTournamentPlayer[] }) {
  if (standings.length === 0) return null;
  const podium = standings.slice(0, 3);
  return (
    <div className="rounded-xl border border-accent/30 bg-parchment-50 p-5">
      <div className="text-xs uppercase tracking-wider text-accent mb-3">Final standings</div>
      <div className="grid grid-cols-3 gap-3 items-end">
        {[1, 0, 2].map((rank) => {
          const p = podium[rank];
          if (!p) return <div key={rank} />;
          const heights = ['h-16', 'h-24', 'h-12'];
          const labels = ['🥈', '🥇', '🥉'];
          return (
            <div key={p.id} className="flex flex-col items-center">
              <div className="text-2xl">{labels[rank]}</div>
              <div className={`${heights[rank]} w-full rounded-t-xl bg-parchment-200 border-x border-t border-parchment-300 flex items-center justify-center`}>
                <span className="font-mono text-ink-900 text-lg">{p.score}</span>
              </div>
              <div className="mt-1 text-sm text-ink-900 truncate max-w-full px-1">{p.user.username}</div>
              <div className="text-[10px] text-ink-400 font-mono">{p.wins}-{p.draws}-{p.losses}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
