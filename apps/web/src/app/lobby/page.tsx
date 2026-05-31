'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useMatch } from '@/store/match';
import { useSocket } from '@/hooks/useSocket';
import { TimeControlPills } from '@/components/TimeControlPills';
import { ChallengesList } from '@/components/ChallengesList';
import { CreateChallengeModal } from '@/components/CreateChallengeModal';
import { PlaySidebar } from '@/components/PlaySidebar';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';

export default function LobbyPage() {
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const socket = useSocket(token);
  const m = useMatch();
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) router.replace('/login');
  }, [hydrated, user, token, router]);

  // If the user has an active game on the server (e.g. after a page reload,
  // or when match:start was missed during a reconnect), rehydrate the match
  // store and jump straight to /play. Runs on mount AND on every socket
  // (re)connect.
  useEffect(() => {
    if (!user || !token || !socket) return;
    let cancelled = false;
    const recover = async () => {
      try {
        const { match } = await api.currentMatch(token);
        if (cancelled || !match || match.ended) return;
        m.hydrate({ ...match, myUserId: user.id });
        socket.emit('match:rejoin', { matchId: match.matchId }, () => {});
        router.replace('/play');
      } catch {
        /* ignore */
      }
    };
    void recover();
    socket.on('connect', recover);
    return () => {
      cancelled = true;
      socket.off('connect', recover);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token, socket]);

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
      router.push('/play');
    };
    socket.on('match:start', onStart);
    return () => {
      socket.off('match:start', onStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.id]);

  if (!user || !socket) return null;

  return (
    <div className="flex">
      <PlaySidebar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full">
        <div className="mb-6 sm:mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-ink-900">
            Find a Match
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Pick a time control or accept an open challenge.
          </p>
        </div>

        <section className="grid lg:grid-cols-[1fr_1.3fr] gap-5 sm:gap-8">
          {/* Time controls */}
          <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5 sm:p-6">
            <h2 className="font-serif text-xl sm:text-2xl text-ink-900 mb-4">
              Quick Play
            </h2>
            <TimeControlPills socket={socket} />
          </div>

          {/* Open challenges */}
          <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-serif text-xl sm:text-2xl text-ink-900">
                Open Challenges
              </h2>
              <button
                onClick={() => setModal(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold-shine px-3 sm:px-4 py-2 text-xs font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                <Plus size={14} strokeWidth={2} />
                Create a Game
              </button>
            </div>
            <ChallengesList socket={socket} />
          </div>
        </section>
      </div>

      {modal && (
        <CreateChallengeModal
          onClose={() => setModal(false)}
          onCreated={(code, isPublic) => {
            setModal(false);
            if (!isPublic) {
              const url = `${window.location.origin}/play/c/${code}`;
              navigator.clipboard?.writeText(url).catch(() => {});
              alert(
                `Private challenge created.\n\nShare this link:\n${url}\n\n(copied to clipboard)`,
              );
            }
          }}
        />
      )}
    </div>
  );
}
