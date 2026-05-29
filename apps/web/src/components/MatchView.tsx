'use client';

import { useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Chess, type Square } from 'chess.js';
import type { Socket } from 'socket.io-client';
import { useMatch } from '@/store/match';
import { useAuth } from '@/store/auth';
import { Clock } from './Clock';
import { MatchSidebar } from './MatchSidebar';
import { Button } from './Button';
import { OnchainBadge } from './OnchainBadge';

const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), {
  ssr: false,
});

interface Props {
  socket: Socket;
}

export function MatchView({ socket }: Props) {
  const m = useMatch();
  const user = useAuth((s) => s.user);
  const [selected, setSelected] = useState<Square | null>(null);

  const chess = useMemo(() => new Chess(m.fen), [m.fen]);

  // Reset selection whenever the position changes (move played, new game, etc).
  // Using fen as a key effectively does this.
  if (!m.matchId || !m.myColor || !user) return null;

  const boardOrientation = m.myColor === 'w' ? 'white' : 'black';
  const myTurn = chess.turn() === m.myColor && !m.ended;

  // Legal target squares from the currently selected square.
  const legalTargets: Set<string> = useMemo(() => {
    if (!selected) return new Set();
    const moves = chess.moves({ square: selected, verbose: true }) as Array<{ to: string }>;
    return new Set(moves.map((mv) => mv.to));
  }, [selected, chess]);

  function isMyPieceOn(square: Square): boolean {
    const piece = chess.get(square);
    return !!piece && piece.color === m.myColor;
  }

  function sendMove(from: Square, to: Square, isPromotion: boolean) {
    const uci = `${from}${to}${isPromotion ? 'q' : ''}`;
    socket.emit(
      'match:move',
      { matchId: m.matchId, uci },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) console.warn('move rejected', ack.error);
      },
    );
  }

  const onSquareClick = useCallback(
    (square: Square) => {
      if (!myTurn) {
        setSelected(null);
        return;
      }

      // 1) Nothing selected yet → select if it's my piece, else ignore.
      if (!selected) {
        if (isMyPieceOn(square)) setSelected(square);
        return;
      }

      // 2) Clicking the same square again → deselect.
      if (selected === square) {
        setSelected(null);
        return;
      }

      // 3) Clicking another of my pieces → reselect.
      if (isMyPieceOn(square)) {
        setSelected(square);
        return;
      }

      // 4) Clicking a legal destination → try the move.
      if (legalTargets.has(square)) {
        const moving = chess.get(selected);
        const isPromotion =
          !!moving &&
          moving.type === 'p' &&
          ((moving.color === 'w' && square[1] === '8') ||
            (moving.color === 'b' && square[1] === '1'));
        sendMove(selected, square, isPromotion);
        setSelected(null);
        return;
      }

      // 5) Clicked an empty / opponent square that isn't a legal target → just deselect.
      setSelected(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, myTurn, chess, legalTargets, m.matchId],
  );

  // Build customSquareStyles for the selected square + its legal targets.
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = {
      background: 'rgba(47, 107, 79, 0.35)', // accent-green tint
    };
    for (const t of legalTargets) {
      const occupied = !!chess.get(t as Square);
      squareStyles[t] = occupied
        ? {
            // ring on capturable squares
            boxShadow: 'inset 0 0 0 4px rgba(161, 58, 46, 0.55)',
          }
        : {
            // dot on empty squares
            background:
              'radial-gradient(circle, rgba(47,107,79,0.45) 18%, transparent 22%)',
          };
    }
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
            arePiecesDraggable={false}
            onSquareClick={onSquareClick}
            customSquareStyles={squareStyles}
            customBoardStyle={{ borderRadius: '0.875rem' }}
            customDarkSquareStyle={{ backgroundColor: '#a89f7b' }}
            customLightSquareStyle={{ backgroundColor: '#f1ecd9' }}
          />
        </div>
        <div className="mt-3">{myClock}</div>

        {m.ended && <EndOverlay />}
        <div className="mt-4"><OnchainBadge /></div>
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
      <div className="mt-1 text-sm text-ink-600">
        {ended.reason.replace(/_/g, ' ').toLowerCase()}
      </div>
      <Button className="mt-4" onClick={reset}>
        New game
      </Button>
    </div>
  );
}
