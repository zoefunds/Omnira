'use client';

import { useEffect } from 'react';
import { API_BASE } from '@/lib/config';
import { useMatch } from '@/store/match';

function short(tx: string) {
  return `${tx.slice(0, 10)}…${tx.slice(-6)}`;
}

export function OnchainBadge() {
  const { matchId, ended, chain, setChain } = useMatch();

  useEffect(() => {
    if (!matchId || !ended || chain?.settledAt) return;
    let stopped = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const r = await fetch(`${API_BASE}/match/${matchId}/onchain`);
        if (r.ok) {
          const j = (await r.json()) as {
            onchainTxHash: string | null;
            onchainSettledAt: string | null;
          };
          if (!stopped) {
            setChain({ matchTx: j.onchainTxHash, settledAt: j.onchainSettledAt });
            if (j.onchainSettledAt) return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (!stopped && attempts < 20) setTimeout(tick, 3000);
    };
    void tick();
    return () => { stopped = true; };
  }, [matchId, ended, chain?.settledAt, setChain]);

  if (!matchId) return null;

  // While the game is live and onchain hasn't reported yet
  if (!ended && !chain?.matchTx) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink-400">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        recording onchain
      </div>
    );
  }

  if (!chain || !chain.matchTx) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink-400">
        <span className="h-1.5 w-1.5 rounded-full bg-parchment-500" />
        confirming onchain…
      </div>
    );
  }

  const settled = !!chain.settledAt;
  return (
    <div className="rounded-xl border border-parchment-300 bg-parchment-50 p-3 text-xs text-ink-600">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${settled ? 'bg-accent' : 'bg-parchment-500'}`} />
        <span className="font-medium text-ink-900">
          {settled ? 'Recorded onchain' : 'Recording onchain…'}
        </span>
      </div>
      <div className="mt-1.5 font-mono break-all">
        match tx <span className="text-ink-900">{short(chain.matchTx)}</span>
      </div>
    </div>
  );
}
