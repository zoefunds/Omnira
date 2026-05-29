'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import type { Socket } from 'socket.io-client';
import { useMatch } from '@/store/match';
import { useAuth } from '@/store/auth';
import { Clock } from './Clock';
import { MatchSidebar } from './MatchSidebar';
import { Button } from './Button';

// react-chessboard is a client-only component
const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), {
  ssr: false,
});

interface Props {
  socket: Socket;
}

export function MatchView({ socket }: Props) {
  const m = useMatch();
  const user = useAuth((s) => s.user);

  const chess = useMemo(() => new Chess(m.fen), [m.fen]);

  if (!m.matchId || !m.myColor || !user) return null;

  const boardOrientation = m.myColor === 'w' ? 'white' : 'black';
  const myTurn = chess.turn() === m.myColor && !m.ended;

  function onPieceDrop(source: string, target: string, piece: string): boolean {
    if (!myTurn) return false;
    const isPromotion =
      (piece[1] === 'P' && target[1] === '8') || (piece[1] === 'P' && target[1] === '1');
    const uci = `${source}${target}${isPromotion ? 'q' : ''}`;

    // optimistic legality check (server still authoritative)
    const trial = new Chess(m.fen);
    let ok = false;
    try {
      const r = trial.move({ from: source, to: target, promotion: isPromotion ? 'q' : undefined });
      ok = !!r;
    } catch {
      ok = false;
    }
    if (!ok) return false;

    socket.emit('match:move', { matchId: m.matchId, uci }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) {
        // server rejected — the next match:move event for our optimistic UI never fires,
        // but our snapshot will be corrected by future authoritative state.
        console.warn('move rejected', ack.error);
      }
    });
    return true;
  }

  const whiteTicking = !m.ended && m.turn === 'w';
  const blackTicking = !m.ended && m.turn === 'b';

  const opponentClock =
    m.myColor === 'w'
      ? <Clock label="Opponent" remainingMs={m.blackMs} tickFrom={m.clockTickFrom} ticking={blackTicking} />
      : <Clock label="Opponent" remainingMs={m.whiteMs} tickFrom={m.clockTickFrom} ticking={whiteTicking} />;
  const myClock =
    m.myColor === 'w'
      ? <Clock label="You" remainingMs={m.whiteMs} tickFrom={m.clockTickFrom} ticking={whiteTicking} />
      : <Clock label="You" remainingMs={m.blackMs} tickFrom={m.clockTickFrom} ticking={blackTicking} />;

  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="max-w-[640px] w-full">
        <div className="mb-3">{opponentClock}</div>
        <div className="rounded-xl overflow-hidden shadow-soft">
          <Chessboard
            position={m.fen}
            boardOrientation={boardOrientation}
            onPieceDrop={onPieceDrop}
            arePiecesDraggable={myTurn}
            customBoardStyle={{ borderRadius: '0.875rem' }}
            customDarkSquareStyle={{ backgroundColor: '#a89f7b' }}
            customLightSquareStyle={{ backgroundColor: '#f1ecd9' }}
          />
        </div>
        <div className="mt-3">{myClock}</div>

        {m.ended && <EndOverlay />}
      </div>
      <MatchSidebar socket={socket} />
    </div>
  );
}

function EndOverlay() {
  const ended = useMatch((s) => s.ended);
  const reset = useMatch((s) => s.reset);
  if (!ended) return null;
  const title =
    ended.outcome === 'DRAW'
      ? 'Draw'
      : ended.outcome === 'WHITE_WON'
        ? 'White wins'
        : 'Black wins';
  return (
    <div className="mt-6 rounded-xl border border-parchment-300 bg-parchment-50 p-5 max-w-md">
      <div className="font-serif text-2xl text-ink-900">{title}</div>
      <div className="mt-1 text-sm text-ink-600">{ended.reason.replace(/_/g, ' ').toLowerCase()}</div>
      <Button className="mt-4" onClick={reset}>
        New game
      </Button>
    </div>
  );
}
