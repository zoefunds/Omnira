'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Chess, type Square } from 'chess.js';
import type { Socket } from 'socket.io-client';
import { useMatch } from '@/store/match';
import { useAuth } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { Clock } from './Clock';
import { MatchSidebar } from './MatchSidebar';
import { Button } from './Button';

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

  const opponentLabel = m.opponentUsername ?? 'Opponent';
  const opponentClock =
    m.myColor === 'w'
      ? <Clock label={opponentLabel} remainingMs={m.blackMs} tickFrom={m.clockTickFrom} ticking={blackTicking} />
      : <Clock label={opponentLabel} remainingMs={m.whiteMs} tickFrom={m.clockTickFrom} ticking={whiteTicking} />;
  const myLabel = m.myUsername ?? user?.username ?? 'You';
  const myClock =
    m.myColor === 'w'
      ? <Clock label={myLabel} remainingMs={m.whiteMs} tickFrom={m.clockTickFrom} ticking={whiteTicking} />
      : <Clock label={myLabel} remainingMs={m.blackMs} tickFrom={m.clockTickFrom} ticking={blackTicking} />;

  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-4 lg:gap-6 items-start" data-test-mycolor={m.myColor ?? ""}>
      <div className="max-w-full lg:max-w-[640px] w-full mx-auto">
        <div className="mb-3">{opponentClock}</div>
        <div className="rounded-xl overflow-hidden shadow-soft">
          <Chessboard
            position={m.fen}
            boardOrientation={boardOrientation}
            arePiecesDraggable={false}
            onSquareClick={onSquareClick}
            customSquareStyles={squareStyles}
            customBoardStyle={{ borderRadius: '0.875rem' }}
            customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
            customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
          />
        </div>
        <div className="mt-3">{myClock}</div>

        {m.ended && <EndOverlay socket={socket} />}
      </div>
      <MatchSidebar socket={socket} />
    </div>
  );
}

function EndOverlay({ socket }: { socket: import('socket.io-client').Socket }) {
  const ended = useMatch((s) => s.ended);
  const myColor = useMatch((s) => s.myColor);
  const opponentUsername = useMatch((s) => s.opponentUsername);
  const tournamentId = useMatch((s) => s.tournamentId);
  const queueRejoin = useMatch((s) => s.queueRejoin);
  const reset = useMatch((s) => s.reset);
  const router = useRouter();
  // Matches the server-side POST_GAME_COOLDOWN_MS (5s). If we re-queue before
  // the cooldown elapses, the server will silently skip us until the cooldown
  // is up, but it's cleaner to align the UI countdown.
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!ended) return;
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [ended, countdown]);

  // When the countdown hits zero, auto-rejoin queue / tournament.
  // Wait for the server's ack before navigating so the destination page
  // sees the user already in queue (avoids a flash of "Join queue" state).
  useEffect(() => {
    if (!ended || countdown > 0) return;
    if (tournamentId) {
      socket.emit(
        'tournament:queue:join',
        { tournamentId },
        (_ack: { ok: boolean; error?: string }) => {
          reset();
          router.replace(`/tournaments/${tournamentId}`);
        },
      );
      // Safety net: navigate after 1s even if the ack never lands.
      const fallback = setTimeout(() => {
        reset();
        router.replace(`/tournaments/${tournamentId}`);
      }, 1000);
      return () => clearTimeout(fallback);
    } else if (queueRejoin) {
      socket.emit(
        'queue:join',
        queueRejoin,
        (_ack: { ok: boolean; status?: string; error?: string }) => {
          reset();
          // Set queueStatus AFTER reset so the lobby renders "Searching" right away
          // (the casual queue doesn't have a tournament:queue:state push to revive it).
          useMatch.setState({ queueStatus: 'waiting' });
          router.replace('/lobby');
        },
      );
      const fallback = setTimeout(() => {
        reset();
        useMatch.setState({ queueStatus: 'waiting' });
        router.replace('/lobby');
      }, 1000);
      return () => clearTimeout(fallback);
    }
    // private games: no auto-rejoin, user goes back manually
  }, [countdown, ended, tournamentId, queueRejoin, socket, reset, router]);

  if (!ended) return null;

  const iWon =
    (ended.outcome === 'WHITE_WON' && myColor === 'w') ||
    (ended.outcome === 'BLACK_WON' && myColor === 'b');
  const isDraw = ended.outcome === 'DRAW';
  const title = isDraw ? 'Draw' : iWon ? 'You won' : 'You lost';
  const subtitle = ended.reason === 'NO_SHOW'
    ? `${iWon ? opponentUsername ?? 'Opponent' : 'You'} failed to move in time`
    : ended.reason.replace(/_/g, ' ').toLowerCase();

  return (
    <div className="mt-6 rounded-xl border border-parchment-300 bg-parchment-50 p-6 max-w-md shadow-card">
      <div
        className={`font-serif text-3xl ${
          isDraw ? 'text-ink-900' : iWon ? 'text-gold-700' : 'text-danger'
        }`}
      >
        {title}
      </div>
      <div className="mt-1 text-sm text-ink-600">{subtitle}</div>
      {(tournamentId || queueRejoin) && countdown > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-gold-300 bg-parchment-100 px-3 py-2 text-xs text-ink-700">
          <span className="h-2 w-2 rounded-full bg-gold-500 animate-pulse" />
          {tournamentId ? 'Next opponent' : 'Re-queueing'} in {countdown}s
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {(tournamentId || queueRejoin) && (
          <Button
            variant="ghost"
            onClick={() => setCountdown(0)}
          >
            Skip wait
          </Button>
        )}
        <Button
          onClick={() => {
            // Cancel any pending rejoin and just go home.
            setCountdown(-1);
            reset();
            router.replace('/lobby');
          }}
        >
          Back to lobby
        </Button>
      </div>
    </div>
  );
}
