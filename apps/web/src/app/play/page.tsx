'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useMatch } from '@/store/match';
import { useSocket } from '@/hooks/useSocket';
// /play now only renders the active match; the matchmaking lobby lives at /lobby.
import { MatchView } from '@/components/MatchView';

export default function PlayPage() {
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const socket = useSocket(token);
  const m = useMatch();

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) router.replace('/login');
  }, [hydrated, user, token, router]);

  useEffect(() => {
    if (!socket || !user) return;

    const onStart = (p: {
      matchId: string;
      whitePlayerId: string;
      blackPlayerId: string;
      fen: string;
      initialMs: number;
      incrementMs: number;
    }) => {
      m.onMatchStart({ ...p, myUserId: user.id });
    };
    const onMove = (p: {
      ply: number;
      san: string;
      uci: string;
      fenAfter: string;
      whiteMs: number;
      blackMs: number;
      turn: 'w' | 'b';
    }) => m.onMatchMove(p);
    const onEnd = (p: { outcome: 'WHITE_WON' | 'BLACK_WON' | 'DRAW'; reason: string }) =>
      m.onMatchEnd(p);
    const onDrawOffer = (p: { from: string }) => {
      // The server sends the userId; translate to color.
      const myColor = m.myColor;
      if (!myColor) return;
      const opponentColor = myColor === 'w' ? 'b' : 'w';
      if (p.from !== user.id) m.onDrawOffer(opponentColor);
    };

    socket.on('match:start', onStart);
    socket.on('match:move', onMove);
    socket.on('match:end', onEnd);
    socket.on('match:drawOffer', onDrawOffer);

    return () => {
      socket.off('match:start', onStart);
      socket.off('match:move', onMove);
      socket.off('match:end', onEnd);
      socket.off('match:drawOffer', onDrawOffer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.id]);

  if (!user || !socket) return null;

  const inMatch = !!m.matchId && !m.ended;
  const hasResult = !!m.matchId && !!m.ended;

  return (
    <section className="space-y-8">
      {!inMatch && !hasResult && <RedirectToLobby />}
      {(inMatch || hasResult) && <MatchView socket={socket} />}

      <div className="rounded-xl border border-parchment-300 bg-parchment-100 p-4 max-w-md text-xs text-ink-400">
        <span>Wallet </span>
        <span className="font-mono text-ink-600">{user.walletAddress}</span>
      </div>
    </section>
  );
}

function RedirectToLobby() {
  const r = useRouter();
  useEffect(() => { r.replace('/lobby'); }, [r]);
  return null;
}
