'use client';

import { Loader2, Swords, Users } from 'lucide-react';
import { Button } from './Button';

interface Props {
  inQueue: boolean;
  readyCount: number;
  inGameCount: number;
  onToggle: () => void;
}

export function TournamentPairingCard({ inQueue, readyCount, inGameCount, onToggle }: Props) {
  return (
    <div
      className={`rounded-xl border shadow-card overflow-hidden ${
        inQueue ? 'border-gold-300 bg-parchment-50' : 'border-parchment-300 bg-parchment-100/60'
      }`}
    >
      <header className="px-5 py-3 border-b border-parchment-300 flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <Swords size={14} className="text-gold-600" strokeWidth={1.5} />
          <span className="text-xs uppercase tracking-[0.25em] text-gold-700">Live pairing</span>
        </div>
        <div className="text-xs text-ink-400 font-mono inline-flex items-center gap-2">
          <Users size={12} strokeWidth={1.5} />
          {readyCount} ready · {inGameCount} in game
        </div>
      </header>
      <div className="px-5 py-5 flex flex-wrap items-center gap-3">
        {inQueue ? (
          <>
            <div className="h-10 w-10 rounded-full bg-gold-shine flex items-center justify-center shadow-soft shrink-0">
              <Loader2 size={18} className="text-parchment-50 animate-spin" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900">Searching for an opponent.</div>
              <div className="text-xs text-ink-600 mt-0.5">
                You&apos;ll be matched the moment a free player is ready.
              </div>
            </div>
            <Button variant="ghost" onClick={onToggle}>
              Leave queue
            </Button>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full bg-parchment-200 border border-parchment-300 flex items-center justify-center shrink-0">
              <Swords size={18} className="text-gold-600" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900">Ready to play?</div>
              <div className="text-xs text-ink-600 mt-0.5">
                Join the queue and the engine pairs you instantly with the closest-rated opponent.
              </div>
            </div>
            <Button onClick={onToggle}>Join queue</Button>
          </>
        )}
      </div>
    </div>
  );
}
