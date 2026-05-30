'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, type ApiChallenge } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useMatch } from '@/store/match';
import { useSocket } from '@/hooks/useSocket';
import { Button } from '@/components/Button';

export default function PrivateChallengePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { user, token, hydrated } = useAuth();
  const socket = useSocket(token);
  const m = useMatch();
  const [challenge, setChallenge] = useState<ApiChallenge | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) router.replace(`/login?next=/play/c/${code}`);
  }, [user, token, code, router]);

  useEffect(() => {
    let alive = true;
    api.getChallenge(code).then((r) => { if (alive) setChallenge(r.challenge); }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (!socket || !user) return;
    const onStart = (p: { matchId: string; whitePlayerId: string; blackPlayerId: string; fen: string; initialMs: number; incrementMs: number }) => {
      m.onMatchStart({ ...p, myUserId: user.id });
      router.push('/play');
    };
    socket.on('match:start', onStart);
    return () => { socket.off('match:start', onStart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.id]);

  if (!user || !challenge) {
    return <div className="text-ink-600">{err ?? 'Loading…'}</div>;
  }

  const mine = challenge.creatorId === user.id;
  const accepted = challenge.status !== 'OPEN';

  function accept() {
    if (!socket) return;
    socket.emit('challenge:accept', { code }, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) setErr(ack.error ?? 'could not accept');
    });
  }

  return (
    <section className="max-w-md">
      <h1 className="font-serif text-3xl text-ink-900">Private game</h1>
      <p className="mt-2 text-ink-600">
        {challenge.creator.username} invites you to play.
      </p>
      <div className="mt-6 rounded-xl border border-parchment-300 bg-parchment-100 p-5">
        <div className="text-sm text-ink-400">Time control</div>
        <div className="font-mono text-xl text-ink-900 mt-0.5">
          {Math.round(challenge.initialMs / 60_000)}+{Math.round(challenge.incrementMs / 1000)}
        </div>
        <div className="text-sm text-ink-400 mt-3">
          {challenge.rated ? 'Rated' : 'Casual'} · {challenge.category.toLowerCase()} ·{' '}
          {challenge.colorPreference === 'RANDOM' ? 'random colors' : `${challenge.creator.username} plays ${challenge.colorPreference.toLowerCase()}`}
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-danger">{err}</p>}

      <div className="mt-6 flex gap-2">
        {accepted ? (
          <p className="text-sm text-ink-400">Challenge is {challenge.status.toLowerCase()}.</p>
        ) : mine ? (
          <p className="text-sm text-ink-400">Waiting for someone to accept this link…</p>
        ) : (
          <Button onClick={accept}>Accept and play</Button>
        )}
      </div>
    </section>
  );
}
