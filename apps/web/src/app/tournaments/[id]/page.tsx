'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type ApiTournament, type ApiTournamentPlayer } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSocket } from '@/hooks/useSocket';
import { useMatch } from '@/store/match';
import { Button } from '@/components/Button';
import { TournamentPairingCard } from '@/components/TournamentPairingCard';
import { TournamentActiveMatches } from '@/components/TournamentActiveMatches';
import { TournamentPodium } from '@/components/TournamentPodium';

function fmtTC(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, token } = useAuth();
  const [t, setT] = useState<ApiTournament | null>(null);
  const [standings, setStandings] = useState<ApiTournamentPlayer[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!user) router.replace('/login'); }, [user, router]);

  async function refresh() {
    try {
      const a = await api.getTournament(id);
      const b = await api.getStandings(id);
      setT(a.tournament); setStandings(b.standings);
    } catch { /* ignore */ }
  }
  useEffect(() => { void refresh(); const i = setInterval(refresh, 5_000); return () => clearInterval(i); }, [id]);
  const socket = useSocket(token);
  const matchStore = useMatch();
  const [inQueue, setInQueue] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [inGameCount, setInGameCount] = useState(0);


  // Subscribe to tournament socket room for live updates + match:start routing.
  useEffect(() => {
    if (!socket || !user) return;
    socket.emit('tournament:subscribe', { tournamentId: id }, () => {});
    const onStart = (p: { matchId: string; whitePlayerId: string; blackPlayerId: string; fen: string; initialMs: number; incrementMs: number; tournamentId?: string }) => {
      if (p.tournamentId !== id) return;
      matchStore.onMatchStart({ ...p, myUserId: user.id });
      router.push('/play');
    };
    const onQueueState = (p: { tournamentId: string; userId: string; ready: boolean }) => {
      if (p.tournamentId !== id) return;
      if (p.userId === user.id) setInQueue(p.ready);
      void refresh();
    };
    const onFinished = (p: { id: string }) => { if (p.id === id) void refresh(); };
    socket.on('match:start', onStart);
    socket.on('tournament:queue:state', onQueueState);
    socket.on('tournament:finished', onFinished);
    const onQueueSummary = (p: { tournamentId: string; readyCount: number; inGameCount: number }) => {
      if (p.tournamentId !== id) return;
      setReadyCount(p.readyCount); setInGameCount(p.inGameCount);
    };
    const onStandingsPush = (p: { tournamentId: string; standings: ApiTournamentPlayer[] }) => {
      if (p.tournamentId !== id) return;
      setStandings(p.standings);
    };
    socket.on('tournament:queue:summary', onQueueSummary);
    socket.on('tournament:standings', onStandingsPush);
    return () => {
      socket.emit('tournament:unsubscribe', { tournamentId: id }, () => {});
      socket.off('match:start', onStart);
      socket.off('tournament:queue:state', onQueueState);
      socket.off('tournament:finished', onFinished);
      socket.off('tournament:queue:summary', onQueueSummary);
      socket.off('tournament:standings', onStandingsPush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user?.id, id]);

  function toggleQueue() {
    if (!socket) return;
    if (inQueue) socket.emit('tournament:queue:leave', { tournamentId: id }, () => setInQueue(false));
    else socket.emit('tournament:queue:join', { tournamentId: id }, () => setInQueue(true));
  }


  if (!user || !t) return <div className="text-ink-600">Loading…</div>;

  const mine = standings.find((p) => p.userId === user.id);
  const canJoin = !mine && (t.status === 'UPCOMING' || t.status === 'ACTIVE');

  async function join() {
    if (!token) return;
    setBusy(true);
    try { await api.joinTournament(id, token); await refresh(); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    if (!token) return;
    setBusy(true);
    try { await api.withdrawTournament(id, token); await refresh(); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-400">Arena · {t.status.toLowerCase()}</div>
          <h1 className="font-serif text-3xl text-ink-900 mt-1">{t.name}</h1>
          <div className="text-sm text-ink-600 mt-1">
            <span className="font-mono">{fmtTC(t.initialMs, t.incrementMs)}</span>
            <span className="mx-2 text-ink-400">·</span>
            {t.rated ? 'rated' : 'casual'}
            <span className="mx-2 text-ink-400">·</span>
            {Math.round(t.durationMs / 60_000)} min
            <span className="mx-2 text-ink-400">·</span>
            host {t.createdBy.username}
          </div>
        </div>
        <div className="flex gap-2">
          {canJoin && <Button onClick={join} disabled={busy}>{busy ? '…' : 'Join arena'}</Button>}
          {mine && !mine.withdrew && t.status === 'ACTIVE' && (
            <Button onClick={toggleQueue}>{inQueue ? 'Leave queue' : 'Join queue'}</Button>
          )}
          {mine && !mine.withdrew && t.status !== 'FINISHED' && (
            <Button variant="ghost" onClick={withdraw} disabled={busy}>Withdraw</Button>
          )}
        </div>
      </header>

      <div className="rounded-xl border border-parchment-300 bg-parchment-100">
        <div className="px-4 py-2 border-b border-parchment-300 flex justify-between">
          <div className="text-xs uppercase tracking-wider text-ink-400">Standings</div>
          <div className="text-xs text-ink-400">{standings.length} player{standings.length === 1 ? '' : 's'}</div>
        </div>
        <ol className="divide-y divide-parchment-300">
          {standings.length === 0 && <li className="p-4 text-sm text-ink-400">No players yet.</li>}
          {standings.map((p, i) => {
            const isMe = p.userId === user.id;
            return (
              <li key={p.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${isMe ? 'bg-parchment-50' : ''}`}>
                <span className="w-6 text-right font-mono text-ink-400">{i + 1}</span>
                <span className={`flex-1 ${isMe ? 'font-medium text-ink-900' : 'text-ink-900'}`}>
                  {p.user.username}
                  {p.withdrew && <span className="ml-2 text-[10px] uppercase text-ink-400">withdrew</span>}
                  {p.hasStreakBonus && <span className="ml-2 text-[10px] uppercase text-accent">streak ×2</span>}
                </span>
                <span className="w-12 text-right font-mono text-ink-600 text-xs">{p.wins}/{p.draws}/{p.losses}</span>
                <span className="w-12 text-right font-mono text-ink-900">{p.score}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div data-onchain-strip className="rounded-xl border border-parchment-300 bg-parchment-50 p-3 text-xs text-ink-600">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div>
            <span className="text-ink-400 mr-1">register tx</span>
            {(t as unknown as { onchainTxHash?: string | null }).onchainTxHash
              ? <span className="font-mono text-ink-900">{(t as unknown as { onchainTxHash?: string }).onchainTxHash!.slice(0, 10)}…{(t as unknown as { onchainTxHash?: string }).onchainTxHash!.slice(-6)}</span>
              : <span className="text-ink-400">pending</span>}
          </div>
          <div>
            <span className="text-ink-400 mr-1">final tx</span>
            {(t as unknown as { onchainSettledTxHash?: string | null }).onchainSettledTxHash
              ? <span className="font-mono text-ink-900">{(t as unknown as { onchainSettledTxHash?: string }).onchainSettledTxHash!.slice(0, 10)}…{(t as unknown as { onchainSettledTxHash?: string }).onchainSettledTxHash!.slice(-6)}</span>
              : <span className="text-ink-400">{t.status === 'FINISHED' ? 'pending' : '—'}</span>}
          </div>
        </div>
      </div>

      {t.status === 'ACTIVE' && mine && !mine.withdrew && (
        <TournamentPairingCard
          inQueue={inQueue}
          readyCount={readyCount}
          inGameCount={inGameCount}
          onToggle={toggleQueue}
        />
      )}

      {t.status === 'ACTIVE' && <TournamentActiveMatches tournamentId={id} />}

      {t.status === 'FINISHED' && <TournamentPodium standings={standings} />}
    </section>
  );
}
