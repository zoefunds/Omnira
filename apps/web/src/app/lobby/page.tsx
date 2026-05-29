'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useMatch } from '@/store/match';
import { useSocket } from '@/hooks/useSocket';
import { TimeControlPills } from '@/components/TimeControlPills';
import { ChallengesList } from '@/components/ChallengesList';
import { CreateChallengeModal } from '@/components/CreateChallengeModal';
import { Button } from '@/components/Button';

export default function LobbyPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const socket = useSocket(token);
  const m = useMatch();
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!user || !token) router.replace('/login');
  }, [user, token, router]);

  // When a match starts (either via queue or accepting a challenge), go to /play.
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
    return () => { socket.off('match:start', onStart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.id]);

  if (!user || !socket) return null;

  return (
    <>
      <section className="grid lg:grid-cols-[1fr_1.4fr] gap-8">
        <div>
          <TimeControlPills socket={socket} />
        </div>
        <div>
          <div className="flex items-center justify-end mb-3">
            <Button onClick={() => setModal(true)}>+ Create a game</Button>
          </div>
          <ChallengesList socket={socket} />
        </div>
      </section>

      {modal && (
        <CreateChallengeModal
          onClose={() => setModal(false)}
          onCreated={(code, isPublic) => {
            setModal(false);
            if (!isPublic) {
              const url = `${window.location.origin}/play/c/${code}`;
              navigator.clipboard?.writeText(url).catch(() => {});
              alert(`Private challenge created.\n\nShare this link:\n${url}\n\n(copied to clipboard)`);
            }
          }}
        />
      )}
    </>
  );
}
