'use client';

import type { ApiTournamentPlayer } from '@/lib/api';
import { Crown, Medal } from 'lucide-react';

interface Slot {
  player: ApiTournamentPlayer;
  place: 1 | 2 | 3;
}

export function TournamentPodium({ standings }: { standings: ApiTournamentPlayer[] }) {
  if (standings.length === 0) return null;

  // Source of truth: standings is sorted by score desc by the server.
  const first = standings[0];
  const second = standings[1];
  const third = standings[2];

  // Visual order: silver | gold | bronze. Keeps the winner centered and the
  // tallest block (1st) in the middle. We render `null` for missing players
  // so the grid still spaces correctly when a tournament had < 3 finishers.
  const slots: Array<Slot | null> = [
    second ? { player: second, place: 2 } : null,
    first ? { player: first, place: 1 } : null,
    third ? { player: third, place: 3 } : null,
  ];

  return (
    <section className="rounded-xl border border-gold-300 bg-parchment-50 shadow-card overflow-hidden">
      <header className="px-5 py-3 border-b border-parchment-300 flex items-center gap-2">
        <Crown size={16} className="text-gold-600" strokeWidth={1.5} />
        <span className="text-xs uppercase tracking-[0.25em] text-gold-700">
          Final Standings
        </span>
      </header>

      <div className="px-5 sm:px-8 pt-8 pb-6">
        <div className="grid grid-cols-3 gap-3 sm:gap-5 items-end max-w-3xl mx-auto">
          {slots.map((slot, i) => (
            <PodiumColumn key={i} slot={slot} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PodiumColumn({ slot }: { slot: Slot | null }) {
  if (!slot) return <div className="h-full" />;
  const { player, place } = slot;

  // Styling per place
  const style = {
    1: {
      tier:
        'h-32 sm:h-40 bg-gradient-to-b from-gold-300 via-gold-500 to-gold-700 ring-2 ring-gold-600/40',
      medalColor: 'text-gold-700',
      medalRing: 'ring-2 ring-gold-400',
      medalBg: 'bg-gold-shine',
      labelColor: 'text-gold-700',
      scoreColor: 'text-parchment-50',
      crown: true,
      number: '1',
    },
    2: {
      tier:
        'h-24 sm:h-32 bg-gradient-to-b from-parchment-300 via-parchment-400 to-parchment-500 ring-1 ring-parchment-500/50',
      medalColor: 'text-ink-600',
      medalRing: 'ring-1 ring-parchment-500',
      medalBg: 'bg-parchment-200',
      labelColor: 'text-ink-600',
      scoreColor: 'text-ink-900',
      crown: false,
      number: '2',
    },
    3: {
      tier:
        'h-20 sm:h-24 bg-gradient-to-b from-[#cd9d6f] via-[#a26a3a] to-[#7d4a1f] ring-1 ring-[#7d4a1f]/40',
      medalColor: 'text-[#7d4a1f]',
      medalRing: 'ring-1 ring-[#a26a3a]',
      medalBg: 'bg-[#cd9d6f]',
      labelColor: 'text-[#7d4a1f]',
      scoreColor: 'text-parchment-50',
      crown: false,
      number: '3',
    },
  }[place];

  return (
    <div className="flex flex-col items-center min-w-0">
      {/* Medal + username + record above the block */}
      <div className="flex flex-col items-center gap-1 mb-2 min-w-0 w-full">
        <div
          className={`relative h-9 w-9 rounded-full flex items-center justify-center shadow-soft ${style.medalBg} ${style.medalRing}`}
        >
          {style.crown ? (
            <Crown size={16} className="text-parchment-50" strokeWidth={1.8} />
          ) : (
            <Medal size={16} className={style.medalColor} strokeWidth={1.8} />
          )}
          <span
            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-parchment-50 text-[9px] flex items-center justify-center font-mono font-bold ${style.labelColor}`}
          >
            {style.number}
          </span>
        </div>
        <div className="font-serif text-sm sm:text-base text-ink-900 truncate max-w-full px-1 text-center">
          {player.user.username}
        </div>
        <div className="text-[10px] text-ink-400 font-mono">
          {player.wins}–{player.draws}–{player.losses}
        </div>
      </div>

      {/* The podium block itself — big score on it */}
      <div
        className={`w-full rounded-t-lg flex items-center justify-center px-2 ${style.tier}`}
      >
        <span
          className={`font-serif font-bold tracking-tight ${style.scoreColor} ${
            place === 1 ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
          }`}
        >
          {player.score}
        </span>
      </div>
    </div>
  );
}
