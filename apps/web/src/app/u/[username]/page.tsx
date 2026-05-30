'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  api,
  type ApiProfile,
  type ApiProfileMatch,
  type ApiProfileTournament,
  type ApiAnalyzedMatch,
} from '@/lib/api';
import { Sparkline } from '@/components/Sparkline';
import {
  Timer,
  Zap,
  Gauge,
  Trophy,
  Medal,
  Star,
  ShieldCheck,
  Award,
  Crown,
  UserPlus,
  Swords,
} from 'lucide-react';

function fmtTC(initialSec: number, incrementSec: number) {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}
function fmtTCMs(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString();
}
function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function fmtMonthYear(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

const CATEGORY_META: Record<
  string,
  { icon: React.ReactNode; label: string }
> = {
  RAPID: { icon: <Timer size={16} strokeWidth={1.5} />, label: 'Rapid' },
  BLITZ: { icon: <Zap size={16} strokeWidth={1.5} />, label: 'Blitz' },
  BULLET: { icon: <Gauge size={16} strokeWidth={1.5} />, label: 'Bullet' },
  CLASSICAL: { icon: <Timer size={16} strokeWidth={1.5} />, label: 'Classical' },
};

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [matches, setMatches] = useState<ApiProfileMatch[]>([]);
  const [history, setHistory] = useState<
    Record<string, Array<{ at: string; rating: number }>>
  >({});
  const [tournaments, setTournaments] = useState<ApiProfileTournament[]>([]);
  const [analyses, setAnalyses] = useState<ApiAnalyzedMatch[]>([]);
  const [puzzleStats, setPuzzleStats] = useState<{
    rating: number;
    solved: number;
    attempted: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m, h, t, a, ps] = await Promise.all([
          api.getProfile(username),
          api.getProfileMatches(username),
          api.getProfileRatings(username),
          api.getProfileTournaments(username),
          api.getProfileAnalyses(username),
          api.getPuzzleStats(username),
        ]);
        if (cancelled) return;
        setProfile(p.profile);
        setMatches(m.matches);
        setHistory(h.history);
        setTournaments(t.tournaments);
        setAnalyses(a.matches);
        setPuzzleStats(
          ps.stats
            ? {
                rating: ps.stats.rating,
                solved: ps.stats.solved,
                attempted: ps.stats.attempted,
              }
            : null,
        );
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Build a heatmap of games per day for the past year.
  const heatmap = useMemo(() => buildHeatmap(matches), [matches]);

  if (err)
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-danger text-sm">
        {err}
      </div>
    );
  if (!profile)
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-ink-600 text-sm">
        Loading…
      </div>
    );

  const peakByCategory = (cat: string) => {
    const arr = (history[cat] ?? []).map((h) => h.rating);
    return arr.length ? Math.max(...arr) : null;
  };
  const deltaThisMonth = (cat: string) => {
    const arr = history[cat] ?? [];
    if (arr.length < 2) return 0;
    const cutoff = Date.now() - 30 * 86400_000;
    const start = [...arr].reverse().find((p) => new Date(p.at).getTime() < cutoff);
    const last = arr[arr.length - 1];
    return start ? last.rating - start.rating : last.rating - arr[0].rating;
  };

  // Trophies: derive from data, render whether earned or locked.
  const trophyDefs = buildTrophies(profile, matches, tournaments);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* ─────────────── HEADER CARD ─────────────── */}
      <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-28 w-28 md:h-32 md:w-32 rounded-xl bg-gold-shine flex items-center justify-center text-parchment-50 font-serif text-5xl shadow-card ring-1 ring-gold-700/30">
              {profile.username.slice(0, 1).toUpperCase()}
            </div>
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-gold-shine px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-parchment-50 shadow-soft">
              Player
            </span>
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-serif text-4xl md:text-5xl text-ink-900 leading-none">
                {profile.username}
              </h1>
              <Crown size={20} className="text-gold-500" strokeWidth={1.5} />
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {profile.ratings.length > 0 && (
                <>
                  <span className="text-gold-700 font-medium">
                    Rating: {topRating(profile.ratings)}
                  </span>
                  <span className="mx-2 text-parchment-500">|</span>
                </>
              )}
              <span>Member since {fmtMonthYear(profile.memberSince)}</span>
            </p>
            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-ink-600">
                Established {new Date(profile.memberSince).getFullYear()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-ink-600">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Online Now
              </span>
              {profile.walletAddress && (
                <button
                  className="font-mono text-ink-600 hover:text-ink-900 inline-flex items-center gap-1.5 rounded-full border border-parchment-300 bg-parchment-50 px-2.5 py-1"
                  onClick={() =>
                    navigator.clipboard?.writeText(profile.walletAddress!)
                  }
                  title="Click to copy"
                >
                  ⛓ {shortAddr(profile.walletAddress)}
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex md:flex-col gap-3">
            <button className="rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition inline-flex items-center justify-center gap-2">
              <UserPlus size={16} strokeWidth={1.5} />
              Follow
            </button>
            <button className="rounded-md border border-ink-900 px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-ink-900 hover:bg-ink-900 hover:text-parchment-50 transition inline-flex items-center justify-center gap-2">
              <Swords size={16} strokeWidth={1.5} />
              Challenge
            </button>
          </div>
        </div>
      </section>

      {/* ─────────────── RATING CARDS ─────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {profile.ratings.slice(0, 3).map((r) => {
          const meta = CATEGORY_META[r.category] ?? {
            icon: <Timer size={16} strokeWidth={1.5} />,
            label: r.category,
          };
          const delta = deltaThisMonth(r.category);
          const peak = peakByCategory(r.category);
          return (
            <div
              key={r.category}
              className="rounded-xl border border-parchment-300 bg-parchment-100/60 p-5 shadow-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-400">
                    {meta.label}
                  </div>
                  <div className="mt-1 font-serif text-4xl text-ink-900">
                    {r.rating}
                  </div>
                </div>
                <div className="h-9 w-9 rounded-md bg-parchment-50 border border-parchment-300 flex items-center justify-center text-gold-600">
                  {meta.icon}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-ink-400">
                  Peak: <span className="text-ink-600">{peak ?? '—'}</span>
                </span>
                <span
                  className={`font-medium ${
                    delta > 0
                      ? 'text-gold-700'
                      : delta < 0
                      ? 'text-danger'
                      : 'text-ink-400'
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta} this month
                </span>
              </div>
              <div className="mt-4 h-12">
                <Sparkline
                  points={(history[r.category] ?? []).map((h) => h.rating)}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* ─────────────── RECENT GAMES + TROPHY ROOM ─────────────── */}
      <section className="grid lg:grid-cols-[1.5fr_1fr] gap-5">
        {/* Recent games */}
        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-parchment-300">
            <h2 className="font-serif text-2xl text-ink-900">Recent Games</h2>
            <Link
              href="#"
              className="text-xs uppercase tracking-wider text-gold-700 hover:text-gold-600"
            >
              View All
            </Link>
          </div>
          {matches.length === 0 ? (
            <div className="p-6 text-sm text-ink-400">
              No completed games yet.
            </div>
          ) : (
            <div className="px-5 py-3">
              <div className="grid grid-cols-[1fr_2fr_auto_auto] text-[11px] uppercase tracking-wider text-ink-400 pb-2 border-b border-parchment-300">
                <div>Date</div>
                <div>Opponent</div>
                <div className="text-center w-20">Result</div>
                <div className="text-right w-20">Rating</div>
              </div>
              <div className="divide-y divide-parchment-300/70">
                {matches.slice(0, 6).map((m) => {
                  const opp =
                    m.whitePlayerId === profile.id
                      ? m.blackPlayer
                      : m.whitePlayer;
                  const isWhite = m.whitePlayerId === profile.id;
                  const result =
                    m.status === 'DRAW'
                      ? 'DRAW'
                      : (m.status === 'WHITE_WON' && isWhite) ||
                        (m.status === 'BLACK_WON' && !isWhite)
                      ? 'WIN'
                      : 'LOSS';
                  const ratingAfter = isWhite
                    ? m.whiteRatingAfter
                    : m.blackRatingAfter;
                  return (
                    <div
                      key={m.id}
                      className="grid grid-cols-[1fr_2fr_auto_auto] items-center py-3 text-sm"
                    >
                      <div className="text-ink-600">
                        {m.endedAt ? fmtDateShort(m.endedAt) : '—'}
                      </div>
                      <div className="truncate">
                        <Link
                          href={`/u/${opp.username}`}
                          className="text-ink-900 font-medium hover:text-gold-700"
                        >
                          {opp.username}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-ink-400">
                          {fmtTC(m.initialTimeSec, m.incrementSec)}
                        </span>
                      </div>
                      <div className="w-20 text-center">
                        <ResultPill result={result} />
                      </div>
                      <div className="w-20 text-right font-mono text-ink-900">
                        {ratingAfter ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Trophy room */}
        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5">
          <h2 className="font-serif text-2xl text-ink-900">Trophy Room</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {trophyDefs.map((t) => (
              <div
                key={t.key}
                className={`relative rounded-md border p-4 flex flex-col items-center text-center transition ${
                  t.earned
                    ? 'border-gold-300 bg-parchment-50 text-ink-900 shadow-soft'
                    : 'border-parchment-300 bg-parchment-100/50 text-ink-400'
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    t.earned
                      ? 'bg-gold-shine text-parchment-50'
                      : 'bg-parchment-200 text-ink-400'
                  }`}
                >
                  {t.icon}
                </div>
                <span className="mt-3 text-[11px] uppercase tracking-wider leading-tight">
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── ACTIVITY HEATMAP ─────────────── */}
      <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl text-ink-900">
              Activity Heatmap
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              {matches.length} games played in the last year
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-ink-400">
            Less
            <span className="h-3 w-3 rounded-sm heat-0" />
            <span className="h-3 w-3 rounded-sm heat-1" />
            <span className="h-3 w-3 rounded-sm heat-2" />
            <span className="h-3 w-3 rounded-sm heat-3" />
            <span className="h-3 w-3 rounded-sm heat-4" />
            More
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <div
            className="grid grid-flow-col gap-[3px]"
            style={{ gridTemplateRows: 'repeat(7, 11px)' }}
          >
            {heatmap.cells.map((c, i) => (
              <div
                key={i}
                title={`${c.date}: ${c.count} games`}
                className={`h-[11px] w-[11px] rounded-sm heat-${c.level}`}
              />
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-ink-400">
            {heatmap.monthLabels.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── PUZZLES + TOURNAMENTS + AI COACHING ─────────────── */}
      {puzzleStats && (
        <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-6">
          <h2 className="font-serif text-2xl text-ink-900 mb-3">Puzzles</h2>
          <div className="flex flex-wrap gap-8">
            <Stat label="Puzzle rating" value={puzzleStats.rating.toString()} />
            <Stat label="Solved" value={puzzleStats.solved.toString()} />
            <Stat label="Attempted" value={puzzleStats.attempted.toString()} />
          </div>
        </section>
      )}

      {tournaments.length > 0 && (
        <section className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card overflow-hidden">
          <div className="p-5 border-b border-parchment-300">
            <h2 className="font-serif text-2xl text-ink-900">Tournaments</h2>
          </div>
          <div className="divide-y divide-parchment-300/70">
            {tournaments.map((tp) => (
              <Link
                key={tp.id}
                href={`/tournaments/${tp.tournament.id}`}
                className="block px-5 py-3 hover:bg-parchment-50 transition"
              >
                <div className="flex items-center gap-3 text-sm">
                  <Trophy
                    size={16}
                    className={
                      tp.tournament.winnerId === profile.id
                        ? 'text-gold-500'
                        : 'text-ink-400'
                    }
                    strokeWidth={1.5}
                  />
                  <div className="flex-1 truncate">
                    <span className="text-ink-900 font-medium">
                      {tp.tournament.name}
                    </span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">
                      {tp.tournament.status.toLowerCase()}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-ink-400">
                    {fmtTCMs(
                      tp.tournament.initialMs,
                      tp.tournament.incrementMs,
                    )}
                  </span>
                  <span className="w-20 text-right font-mono text-xs text-ink-600">
                    {tp.wins}/{tp.draws}/{tp.losses}
                  </span>
                  <span className="w-12 text-right font-mono text-ink-900">
                    {tp.score}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {analyses.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl text-ink-900 mb-3">
            AI Coaching Archive
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {analyses.map((a) => {
              const isWhite = a.whitePlayer.id === profile.id;
              const opp = isWhite ? a.blackPlayer : a.whitePlayer;
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-parchment-300 bg-parchment-100/60 p-4 shadow-card"
                >
                  <div className="text-xs text-ink-400 mb-2">
                    vs{' '}
                    <Link
                      href={`/u/${opp.username}`}
                      className="text-ink-900 hover:text-gold-700"
                    >
                      {opp.username}
                    </Link>
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
    </div>
  );
}

/* ─────────────────── helpers ─────────────────── */

function topRating(ratings: ApiProfile['ratings']) {
  if (!ratings.length) return '—';
  return Math.max(...ratings.map((r) => r.rating));
}

function ResultPill({ result }: { result: 'WIN' | 'LOSS' | 'DRAW' }) {
  const styles =
    result === 'WIN'
      ? 'bg-gold-100 text-gold-700 border-gold-300'
      : result === 'LOSS'
      ? 'bg-danger/10 text-danger border-danger/30'
      : 'bg-parchment-200 text-ink-600 border-parchment-400';
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase ${styles}`}
    >
      {result}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl text-ink-900">{value}</div>
    </div>
  );
}

/* ─────────────────── trophies ─────────────────── */

function buildTrophies(
  profile: ApiProfile,
  matches: ApiProfileMatch[],
  tournaments: ApiProfileTournament[],
) {
  const wins = matches.filter((m) => {
    const isWhite = m.whitePlayerId === profile.id;
    return (
      (m.status === 'WHITE_WON' && isWhite) ||
      (m.status === 'BLACK_WON' && !isWhite)
    );
  }).length;
  const tournamentWins = tournaments.filter(
    (t) => t.tournament.winnerId === profile.id,
  ).length;
  const topRating = profile.ratings.length
    ? Math.max(...profile.ratings.map((r) => r.rating))
    : 0;
  const losses = matches.filter((m) => {
    const isWhite = m.whitePlayerId === profile.id;
    return (
      (m.status === 'BLACK_WON' && isWhite) ||
      (m.status === 'WHITE_WON' && !isWhite)
    );
  }).length;

  return [
    {
      key: 'first-win',
      label: 'First Win',
      icon: <Trophy size={18} strokeWidth={1.5} />,
      earned: wins >= 1,
    },
    {
      key: 'puzzle-god',
      label: 'Puzzle God',
      icon: <Star size={18} strokeWidth={1.5} />,
      earned: false,
    },
    {
      key: 'tournament-champ',
      label: 'Tournament Champ',
      icon: <Medal size={18} strokeWidth={1.5} />,
      earned: tournamentWins >= 1,
    },
    {
      key: 'elite-master',
      label: 'Elite Master',
      icon: <Crown size={18} strokeWidth={1.5} />,
      earned: topRating >= 2000,
    },
    {
      key: 'unbeaten',
      label: 'Unbeaten',
      icon: <ShieldCheck size={18} strokeWidth={1.5} />,
      earned: matches.length >= 10 && losses === 0,
    },
    {
      key: 'top-tier',
      label: 'Top Tier',
      icon: <Award size={18} strokeWidth={1.5} />,
      earned: topRating >= 2400,
    },
  ];
}

/* ─────────────────── heatmap ─────────────────── */

function buildHeatmap(matches: ApiProfileMatch[]): {
  cells: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }>;
  monthLabels: string[];
} {
  const days = 365;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  // Align to Sunday so weeks align to columns of 7.
  const dow = start.getDay();
  start.setDate(start.getDate() - dow);

  const total = Math.ceil((today.getTime() - start.getTime()) / 86400_000) + 1;

  const countByDay = new Map<string, number>();
  for (const m of matches) {
    if (!m.endedAt) continue;
    const d = new Date(m.endedAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const cells: Array<{
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }> = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const count = countByDay.get(key) ?? 0;
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    cells.push({ date: key, count, level });
  }

  // Month labels — 5 evenly spaced.
  const months = ['', '', '', '', ''];
  const monthsAgo = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - n);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };
  months[0] = monthsAgo(12);
  months[1] = monthsAgo(9);
  months[2] = monthsAgo(6);
  months[3] = monthsAgo(3);
  months[4] = monthsAgo(0);

  return { cells, monthLabels: months };
}
