'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { Socket } from 'socket.io-client';
import { useMatch } from '@/store/match';
import { ChatPanel } from './ChatPanel';
import { OnchainBadge } from './OnchainBadge';
import { AnalysisPanel } from './AnalysisPanel';
import { Handshake, Flag, Check, X } from 'lucide-react';

type Tab = 'moves' | 'chat' | 'chain' | 'analysis';

interface Props {
  socket: Socket;
}

export function MatchSidebar({ socket }: Props) {
  const { matchId, history, myColor, drawOfferFrom, ended } = useMatch();
  const [tab, setTab] = useState<Tab>('moves');
  const [offerSent, setOfferSent] = useState(false);

  // Clear "offer sent" if game ends, opponent rejects (move played), or accepts.
  useEffect(() => {
    if (ended) setOfferSent(false);
  }, [ended]);
  useEffect(() => {
    setOfferSent(false);
  }, [history.length]);

  if (!matchId) return null;

  function resign() {
    if (confirm('Resign this game?')) socket.emit('match:resign', { matchId });
  }
  function offerDraw() {
    socket.emit(
      'match:offerDraw',
      { matchId },
      (ack: { ok: boolean; error?: string }) => {
        if (ack?.ok) setOfferSent(true);
      },
    );
    // Optimistically reflect — even if no ack comes, this is visible.
    setOfferSent(true);
  }
  function cancelOffer() {
    // No protocol verb for cancel; just hide our pending UI.
    setOfferSent(false);
  }
  function acceptDraw() {
    socket.emit('match:acceptDraw', { matchId });
  }
  function declineDraw() {
    useMatch.setState({ drawOfferFrom: null });
  }

  const rows: Array<{ n: number; w?: string; b?: string }> = [];
  for (const item of history) {
    const n = Math.ceil(item.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.n !== n) {
      row = { n };
      rows.push(row);
    }
    if (item.ply % 2 === 1) row.w = item.san;
    else row.b = item.san;
  }

  const drawFromOpponent = drawOfferFrom && drawOfferFrom !== myColor;

  return (
    <aside className="w-full lg:w-80 rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-4 flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex border-b border-parchment-300 -mx-1 px-1">
        {(
          [
            ['moves', 'Moves'],
            ['chat', 'Chat'],
            ['chain', 'Onchain'],
            ['analysis', 'Analysis'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-3 py-1.5 text-sm -mb-px border-b-2 transition',
              tab === key
                ? 'border-gold-500 text-ink-900 font-medium'
                : 'border-transparent text-ink-400 hover:text-ink-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[18rem]">
        {tab === 'moves' && (
          <ol className="max-h-72 overflow-y-auto font-mono text-sm text-ink-900 space-y-0.5">
            {rows.length === 0 && (
              <li className="text-ink-400 text-xs italic">No moves yet.</li>
            )}
            {rows.map((r) => (
              <li key={r.n} className="flex gap-3">
                <span className="w-6 text-right text-ink-400">{r.n}.</span>
                <span className="w-16">{r.w ?? ''}</span>
                <span className="w-16">{r.b ?? ''}</span>
              </li>
            ))}
          </ol>
        )}

        {tab === 'chat' && <ChatPanel matchId={matchId} socket={socket} />}
        {tab === 'chain' && <OnchainBadge />}
        {tab === 'analysis' && <AnalysisPanel />}
      </div>

      {/* Game controls */}
      {!ended && (
        <div className="flex flex-col gap-2 pt-3 border-t border-parchment-300">
          {/* Incoming draw offer */}
          {drawFromOpponent && (
            <div className="rounded-md border border-gold-300 bg-parchment-50 p-3">
              <div className="text-sm text-ink-900 inline-flex items-center gap-2">
                <Handshake size={16} className="text-gold-600" strokeWidth={1.5} />
                Opponent offers a draw
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={acceptDraw}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-gold-shine py-2 text-sm font-medium text-parchment-50 shadow-soft hover:opacity-90 transition"
                >
                  <Check size={14} strokeWidth={2} />
                  Accept
                </button>
                <button
                  onClick={declineDraw}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-parchment-400 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
                >
                  <X size={14} strokeWidth={2} />
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Outgoing draw offer (pending) */}
          {offerSent && !drawFromOpponent && (
            <div className="rounded-md border border-gold-300 bg-parchment-50 p-3">
              <div className="text-sm text-ink-900 inline-flex items-center gap-2">
                <Handshake
                  size={16}
                  className="text-gold-600 animate-pulse"
                  strokeWidth={1.5}
                />
                Draw offer sent
              </div>
              <p className="text-xs text-ink-400 mt-1">
                Waiting for opponent. Make a move to retract.
              </p>
              <button
                onClick={cancelOffer}
                className="mt-2 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-900"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Default action row */}
          {!drawFromOpponent && !offerSent && (
            <div className="flex gap-2">
              <button
                onClick={offerDraw}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-parchment-400 py-2 text-sm text-ink-600 hover:border-gold-400 hover:text-gold-700 transition"
              >
                <Handshake size={14} strokeWidth={1.5} />
                Offer draw
              </button>
              <button
                onClick={resign}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-danger/40 py-2 text-sm text-danger hover:bg-danger hover:text-parchment-50 transition"
              >
                <Flag size={14} strokeWidth={1.5} />
                Resign
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
