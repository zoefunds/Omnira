'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useMatch } from '@/store/match';
import { useSocket } from '@/hooks/useSocket';
// /play now only renders the active match; the matchmaking lobby lives at /lobby.
import { MatchView } from '@/components/MatchView';
import { PlaySidebar } from '@/components/PlaySidebar';
import { api } from '@/lib/api';
import { playSound, soundForSan } from '@/lib/sounds';
import { useSettings } from '@/store/settings';

export default function PlayPage() {
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const socket = useSocket(token);
  const m = useMatch();
  // Gate RedirectToLobby on the rejoin check so we don't bounce out before
  // /me/current-match has had a chance to rehydrate.
  const [rejoinChecked, setRejoinChecked] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) router.replace('/login');
  }, [hydrated, user, token, router]);

  // Rejoin on direct /play visit if local state is empty (page reload, deep link).
  useEffect(() => {
    if (!user || !token || !socket) return;
    if (m.matchId) {
      setRejoinChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { match } = await api.currentMatch(token);
        if (cancelled) return;
        if (!match || match.ended) {
          setRejoinChecked(true);
          return;
        }
        m.hydrate({ ...match, myUserId: user.id });
        socket.emit('match:rejoin', { matchId: match.matchId }, () => {});
        setRejoinChecked(true);
      } catch {
        if (!cancelled) setRejoinChecked(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token, socket]);

  useEffect(() => {
    if (!socket || !user) return;

    const soundOn = () => useSettings.getState().soundEnabled;

    const onStart = (p: {
      matchId: string;
      whitePlayerId: string;
      blackPlayerId: string;
      fen: string;
      initialMs: number;
      incrementMs: number;
    }) => {
      m.onMatchStart({ ...p, myUserId: user.id });
      if (soundOn()) playSound('matchStart');
    };
    const onMove = (p: {
      ply: number;
      san: string;
      uci: string;
      fenAfter: string;
      whiteMs: number;
      blackMs: number;
      turn: 'w' | 'b';
    }) => {
      m.onMatchMove(p);
      // Play AFTER updating the store so the board has already redrawn.
      if (soundOn()) playSound(soundForSan(p.san));
    };
    const onEnd = (p: { outcome: 'WHITE_WON' | 'BLACK_WON' | 'DRAW'; reason: string }) => {
      m.onMatchEnd(p);
      if (!soundOn()) return;
      const myColor = useMatch.getState().myColor;
      if (p.outcome === 'DRAW') playSound('draw');
      else if (
        (p.outcome === 'WHITE_WON' && myColor === 'w') ||
        (p.outcome === 'BLACK_WON' && myColor === 'b')
      ) {
        playSound('win');
      } else {
        playSound('loss');
      }
    };
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
    <div className="flex">
      <PlaySidebar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 w-full">
        {!inMatch && !hasResult && rejoinChecked && <RedirectToLobby />}
        {!inMatch && !hasResult && !rejoinChecked && (
          <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-12 text-center text-sm text-ink-600">
            Reconnecting to your game…
          </div>
        )}
        {(inMatch || hasResult) && <MatchView socket={socket} />}

        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 p-4 max-w-md text-xs text-ink-400 shadow-card">
          <span>Wallet </span>
          <span className="font-mono text-ink-600">{user.walletAddress}</span>
        </div>
      </div>
    </div>
  );
}

function RedirectToLobby() {
  const r = useRouter();
  useEffect(() => { r.replace('/lobby'); }, [r]);
  return null;
}
