'use client';

import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { api, type ApiChallenge } from '@/lib/api';
import { useLobby } from '@/store/lobby';
import { useAuth } from '@/store/auth';
import { Button } from './Button';

function fmtTC(initialMs: number, incrementMs: number) {
  const min = Math.round(initialMs / 60_000);
  const inc = Math.round(incrementMs / 1000);
  return `${min}+${inc}`;
}

export function ChallengesList({ socket }: { socket: Socket }) {
  const { challenges, setChallenges, upsert, remove } = useLobby();
  const user = useAuth((s) => s.user);

  useEffect(() => {
    let alive = true;
    api.listChallenges().then((r) => { if (alive) setChallenges(r.challenges); }).catch(() => {});
    return () => { alive = false; };
  }, [setChallenges]);

  useEffect(() => {
    socket.emit('lobby:subscribe', {}, () => {});
    const onCreated = ({ challenge }: { challenge: ApiChallenge }) => upsert(challenge);
    const onCancelled = ({ code }: { code: string }) => remove(code);
    const onAccepted = ({ code }: { code: string }) => remove(code);
    socket.on('challenge:created', onCreated);
    socket.on('challenge:cancelled', onCancelled);
    socket.on('challenge:accepted', onAccepted);
    return () => {
      socket.emit('lobby:unsubscribe', {}, () => {});
      socket.off('challenge:created', onCreated);
      socket.off('challenge:cancelled', onCancelled);
      socket.off('challenge:accepted', onAccepted);
    };
  }, [socket, upsert, remove]);

  function accept(c: ApiChallenge) {
    void import('@/lib/sounds').then((mod) => mod.primeAudio());
    socket.emit('challenge:accept', { code: c.code }, (ack: { ok: boolean; matchId?: string; error?: string }) => {
      if (!ack.ok) alert(ack.error ?? 'could not accept');
      // On success, `match:start` will be broadcast and the PlayPage hook routes the user.
    });
  }

  function cancel(c: ApiChallenge) {
    const token = useAuth.getState().token;
    if (!token) return;
    void api.cancelChallenge(c.code, token).catch(() => {});
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-xl text-ink-900">Open games</h2>
        <span className="text-xs text-ink-400">{challenges.length} open</span>
      </div>
      <div className="rounded-xl border border-parchment-300 bg-parchment-100 divide-y divide-parchment-300">
        {challenges.length === 0 && (
          <div className="p-5 text-sm text-ink-400">
            No open challenges. Create one ↗ to start a game with anyone.
          </div>
        )}
        {challenges.map((c) => {
          const mine = user?.id === c.creatorId;
          return (
            <div key={c.code} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm text-ink-900">
                  <span className="font-medium">{c.creator.username}</span>{' '}
                  <span className="text-ink-400">·</span>{' '}
                  <span className="font-mono">{fmtTC(c.initialMs, c.incrementMs)}</span>{' '}
                  <span className="text-ink-400">·</span>{' '}
                  <span className="text-ink-600">{c.category.toLowerCase()}</span>{' '}
                  {c.rated ? <span className="text-ink-400">· rated</span> : <span className="text-ink-400">· casual</span>}
                </div>
                {!c.isPublic && (
                  <div className="text-[11px] text-ink-400 mt-0.5">private · code {c.code}</div>
                )}
              </div>
              {mine ? (
                <Button variant="ghost" onClick={() => cancel(c)}>Cancel</Button>
              ) : (
                <Button onClick={() => accept(c)}>Accept</Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
