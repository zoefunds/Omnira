'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  api,
  type ApiProfile, type ApiProfileMatch, type ApiProfileTournament, type ApiAnalyzedMatch,
} from '@/lib/api';
import { Sparkline } from '@/components/Sparkline';

function fmtTC(initialSec: number, incrementSec: number) {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}
function fmtTCMs(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString();
}
function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [matches, setMatches] = useState<ApiProfileMatch[]>([]);
  const [history, setHistory] = useState<Record<string, Array<{ at: string; rating: number }>>>({});
  const [tournaments, setTournaments] = useState<ApiProfileTournament[]>([]);
  const [analyses, setAnalyses] = useState<ApiAnalyzedMatch[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m, h, t, a] = await Promise.all([
          api.getProfile(username),
          api.getProfileMatches(username),
          api.getProfileRatings(username),
          api.getProfileTournaments(username),
          api.getProfileAnalyses(username),
        ]);
        if (cancelled) return;
        setProfile(p.profile); setMatches(m.matches); setHistory(h.history);
        setTournaments(t.tournaments); setAnalyses(a.matches);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  if (err) return <div className="text-danger text-sm">{err}</div>;
  if (!profile) return <div className="text-ink-600 text-sm">Loading…</div>;

  function resultBadge(m: ApiProfileMatch) {
    const userId = profile!.id;
    const isWhite = m.whitePlayerId === userId;
    if (m.status === 'DRAW') return <span className="text-ink-400">½</span>;
    const iWon = (m.status === 'WHITE_WON' && isWhite) || (m.status === 'BLACK_WON' && !isWhite);
    return <span className={iWon ? 'text-accent' : 'text-danger'}>{iWon ? 'W' : 'L'}</span>;
  }
  function ratingAfter(m: ApiProfileMatch) {
    return m.whitePlayerId === profile!.id ? m.whiteRatingAfter : m.blackRatingAfter;
  }
  function opponent(m: ApiProfileMatch) {
    return m.whitePlayerId === profile!.id ? m.blackPlayer : m.whitePlayer;
  }

  return (
    <section className="space-y-8">
      {/* Header */}
      <header className="flex items-start gap-6">
        <div className="flex-1">
          <h1 className="font-serif text-3xl text-ink-900">{profile.username}</h1>
          <div className="mt-1 text-xs text-ink-400">
            member since {fmtDateShort(profile.memberSince)}
          </div>
          {profile.walletAddress && (
            <button
              className="mt-2 text-xs font-mono text-ink-600 hover:text-ink-900"
              onClick={() => navigator.clipboard?.writeText(profile.walletAddress!)}
              title="Click to copy"
            >
              ⛓ {shortAddr(profile.walletAddress)}
            </button>
          )}
        </div>
      </header>

      {/* Ratings grid */}
      <section>
        <h2 className="font-serif text-xl text-ink-900 mb-3">Ratings</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {profile.ratings.map((r) => (
            <div key={r.category} className="rounded-xl border border-parchment-300 bg-parchment-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-400">{r.category.toLowerCase()}</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-mono text-2xl text-ink-900">{r.rating}</span>
                <span className="text-[10px] text-ink-400">{r.gamesPlayed} games</span>
              </div>
              <div className="mt-2">
                <Sparkline points={(history[r.category] ?? []).map((h) => h.rating)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent games */}
      <section>
        <h2 className="font-serif text-xl text-ink-900 mb-3">Recent games</h2>
        <div className="rounded-xl border border-parchment-300 bg-parchment-100 divide-y divide-parchment-300">
          {matches.length === 0 && <div className="p-4 text-sm text-ink-400">No completed games yet.</div>}
          {matches.map((m) => (
            <div key={m.id} className="px-4 py-2 flex items-center gap-3 text-sm">
              <div className="w-6 text-center">{resultBadge(m)}</div>
              <div className="w-12 text-[10px] uppercase tracking-wider text-ink-400">{m.category.toLowerCase()}</div>
              <div className="w-16 font-mono text-xs text-ink-600">{fmtTC(m.initialTimeSec, m.incrementSec)}</div>
              <div className="flex-1 truncate text-ink-900">
                vs <Link href={`/u/${opponent(m).username}`} className="hover:underline">{opponent(m).username}</Link>
              </div>
              <div className="w-14 text-right font-mono text-ink-900">{ratingAfter(m) ?? '—'}</div>
              <Link href={`/play?match=${m.id}`} className="w-14 text-right text-xs text-accent hover:underline">
                {m.analysis?.llmSummary ? 'analysis' : 'replay'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Tournaments */}
      {tournaments.length > 0 && (
        <section>
          <h2 className="font-serif text-xl text-ink-900 mb-3">Tournaments</h2>
          <div className="rounded-xl border border-parchment-300 bg-parchment-100 divide-y divide-parchment-300">
            {tournaments.map((tp) => (
              <Link key={tp.id} href={`/tournaments/${tp.tournament.id}`}
                className="block px-4 py-2 hover:bg-parchment-50">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1 truncate">
                    <span className="text-ink-900">{tp.tournament.name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">
                      {tp.tournament.status.toLowerCase()}
                    </span>
                    {tp.tournament.winnerId === profile.id && <span className="ml-2 text-xs">🏆</span>}
                  </div>
                  <span className="font-mono text-xs text-ink-600">{fmtTCMs(tp.tournament.initialMs, tp.tournament.incrementMs)}</span>
                  <span className="w-16 text-right font-mono text-ink-600 text-xs">{tp.wins}/{tp.draws}/{tp.losses}</span>
                  <span className="w-12 text-right font-mono text-ink-900">{tp.score}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* AI coaching archive */}
      {analyses.length > 0 && (
        <section>
          <h2 className="font-serif text-xl text-ink-900 mb-3">AI coaching archive</h2>
          <div className="space-y-2">
            {analyses.map((a) => {
              const isWhite = a.whitePlayer.id === profile.id;
              const opp = isWhite ? a.blackPlayer : a.whitePlayer;
              return (
                <div key={a.id} className="rounded-xl border border-parchment-300 bg-parchment-50 p-3">
                  <div className="text-xs text-ink-400 mb-1">
                    vs <Link href={`/u/${opp.username}`} className="text-ink-900 hover:underline">{opp.username}</Link>
                    <span className="mx-2">·</span>
                    {a.category.toLowerCase()}
                    <span className="mx-2">·</span>
                    {a.endedAt && fmtDateShort(a.endedAt)}
                  </div>
                  <p className="text-sm text-ink-900 leading-snug line-clamp-3">
                    {a.analysis.llmSummary}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
