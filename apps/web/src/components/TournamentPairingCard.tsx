'use client';

import { Button } from './Button';

interface Props {
  inQueue: boolean;
  readyCount: number;
  inGameCount: number;
  onToggle: () => void;
}

export function TournamentPairingCard({ inQueue, readyCount, inGameCount, onToggle }: Props) {
  return (
    <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-ink-400">Live pairing</div>
        <div className="text-xs text-ink-400 font-mono">
          {readyCount} ready · {inGameCount} in game
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {inQueue ? (
          <>
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-sm text-ink-900">Searching for an opponent…</span>
            <Button variant="ghost" className="ml-auto" onClick={onToggle}>Leave queue</Button>
          </>
        ) : (
          <>
            <span className="text-sm text-ink-600">Join the queue and the engine pairs you instantly.</span>
            <Button className="ml-auto" onClick={onToggle}>Join queue</Button>
          </>
        )}
      </div>
    </div>
  );
}
