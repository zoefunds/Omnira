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
import { CopyTxHash } from '@/components/CopyTxHash';

function fmtTC(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const [t, setT] = useState<ApiTournament | null>(null);
  const [standings, setStandings] = useState<ApiTournamentPlayer[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!hydrated) return; if (!user) router.replace('/login'); }, [hydrated, user, router]);

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
    const onStart = (p: { matchId: string; whitePlayerId: string; blackPlayerId: string; whiteUsername?: string | null; blackUsername?: string | null; fen: string; initialMs: number; incrementMs: number; tournamentId?: string }) => {
      if (p.tournamentId !== id) return;
      matchStore.onMatchStart({ ...p, myUserId: user.id, tournamentId: id });
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
    try {
      await api.joinTournament(id, token);
      await refresh();
      // Auto-enter the pairing pool the moment we join — same flow as lichess.
      if (socket) {
        socket.emit('tournament:queue:join', { tournamentId: id }, () => {
          setInQueue(true);
        });
      }
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!token) return;
    setBusy(true);
    try { await api.withdrawTournament(id, token); await refresh(); }
    finally { setBusy(false); }
  }

  const statusTone =
    t.status === 'ACTIVE'   ? 'bg-success/10 text-success border-success/40' :
    t.status === 'FINISHED' ? 'bg-gold-100 text-gold-700 border-gold-300' :
    t.status === 'CANCELLED'? 'bg-danger/10 text-danger border-danger/40' :
                              'bg-parchment-200 text-ink-600 border-parchment-400';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* HERO HEADER */}
      <header className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-[0.25em] text-gold-700">Arena</span>
              <span className={`inline-flex items-center text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 ${statusTone}`}>
                {t.status.toLowerCase()}
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 mt-1.5">{t.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-parchment-50 border border-parchment-300 px-2 py-1 font-mono text-xs">
                {fmtTC(t.initialMs, t.incrementMs)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-parchment-50 border border-parchment-300 px-2 py-1 text-xs">
                {t.rated ? 'Rated' : 'Casual'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-parchment-50 border border-parchment-300 px-2 py-1 text-xs">
                {Math.round(t.durationMs / 60_000)} min
              </span>
              <span className="text-xs text-ink-400">host <span className="text-ink-700">{t.createdBy.username}</span></span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {canJoin && <Button onClick={join} disabled={busy}>{busy ? '…' : 'Join arena'}</Button>}
            {mine && !mine.withdrew && t.status === 'ACTIVE' && (
              <Button onClick={toggleQueue}>{inQueue ? 'Leave queue' : 'Join queue'}</Button>
            )}
            {mine && !mine.withdrew && t.status !== 'FINISHED' && (
              <Button variant="ghost" onClick={withdraw} disabled={busy}>Withdraw</Button>
            )}
          </div>
        </div>
      </header>

      {/* PODIUM at the TOP when finished — that's the real headline */}
      {t.status === 'FINISHED' && <TournamentPodium standings={standings} />}

      {/* Pairing + active-matches stack (only while active) */}
      {t.status === 'ACTIVE' && mine && !mine.withdrew && (
        <TournamentPairingCard
          inQueue={inQueue}
          readyCount={readyCount}
          inGameCount={inGameCount}
          onToggle={toggleQueue}
        />
      )}
      {t.status === 'ACTIVE' && <TournamentActiveMatches tournamentId={id} />}

      {/* LEADERBOARD — full list */}
      <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-parchment-300 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.25em] text-gold-700">Leaderboard</span>
          <span className="text-xs text-ink-400">{standings.length} player{standings.length === 1 ? '' : 's'}</span>
        </div>
        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_4rem] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider text-ink-400 bg-parchment-50/70 border-b border-parchment-300/70">
          <span className="text-right">Rank</span>
          <span>Player</span>
          <span className="text-right">W-D-L</span>
          <span className="text-right">Score</span>
        </div>
        <ol className="divide-y divide-parchment-300/70 max-h-[60vh] overflow-y-auto">
          {standings.length === 0 && (
            <li className="p-6 text-sm text-ink-400 text-center">No players yet.</li>
          )}
          {standings.map((p, i) => {
            const isMe = p.userId === user.id;
            const rank = i + 1;
            return (
              <li
                key={p.id}
                className={`grid grid-cols-[3rem_1fr_5rem_4rem] gap-3 items-center px-5 py-2.5 text-sm transition ${
                  isMe ? 'bg-parchment-50' : 'hover:bg-parchment-50/60'
                }`}
              >
                <span className="text-right font-mono text-xs">
                  {rank === 1 ? (
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gold-shine text-parchment-50 font-bold">1</span>
                  ) : rank === 2 ? (
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-parchment-400 text-parchment-50 font-bold">2</span>
                  ) : rank === 3 ? (
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-parchment-50 font-bold" style={{ background: '#a26a3a' }}>3</span>
                  ) : (
                    <span className="text-ink-400">{rank}</span>
                  )}
                </span>
                <span className={`min-w-0 ${isMe ? 'font-medium text-ink-900' : 'text-ink-900'} truncate`}>
                  {p.user.username}
                  {isMe && <span className="ml-1.5 text-[10px] uppercase text-gold-700">you</span>}
                  {p.withdrew && <span className="ml-1.5 text-[10px] uppercase text-ink-400">withdrew</span>}
                  {p.hasStreakBonus && <span className="ml-1.5 text-[10px] uppercase text-accent">streak ×2</span>}
                </span>
                <span className="text-right font-mono text-ink-600 text-xs">{p.wins}–{p.draws}–{p.losses}</span>
                <span className={`text-right font-mono ${rank === 1 ? 'text-gold-700 font-semibold' : 'text-ink-900'}`}>
                  {p.score}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ONCHAIN AT THE FOOTER */}
      <div data-onchain-strip className="rounded-xl border border-parchment-300 bg-parchment-50 p-4 text-xs text-ink-600">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold-700 mb-2">Onchain</div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-400">register tx</span>
            {(t as unknown as { onchainTxHash?: string | null }).onchainTxHash
              ? <CopyTxHash value={(t as unknown as { onchainTxHash: string }).onchainTxHash} />
              : <span className="text-ink-400">pending</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-400">final tx</span>
            {(t as unknown as { onchainSettledTxHash?: string | null }).onchainSettledTxHash
              ? <CopyTxHash value={(t as unknown as { onchainSettledTxHash: string }).onchainSettledTxHash} />
              : <span className="text-ink-400">{t.status === 'FINISHED' ? 'pending' : '—'}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
