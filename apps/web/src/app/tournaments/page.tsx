'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiTournament } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { CreateTournamentModal } from '@/components/CreateTournamentModal';
import { Trophy, Plus, Users, Clock, Timer } from 'lucide-react';

function fmtTC(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}

function relative(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return `${Math.round(-ms / 60_000)}m ago`;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}

function StatusPill({ status }: { status: ApiTournament['status'] }) {
  const map = {
    UPCOMING: 'bg-parchment-300 text-ink-600 border-parchment-400',
    ACTIVE: 'bg-gold-100 text-gold-700 border-gold-300',
    FINISHED: 'bg-parchment-200 text-ink-400 border-parchment-300',
    CANCELLED: 'bg-danger/10 text-danger border-danger/30',
  } as const;
  return (
    <span
      className={`text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 ${map[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

type Filter = 'all' | 'active' | 'upcoming' | 'finished';

export default function TournamentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<ApiTournament[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  async function refresh() {
    const r = await api.listTournaments();
    setList(r.tournaments);
  }
  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return list;
    const map: Record<Exclude<Filter, 'all'>, ApiTournament['status']> = {
      active: 'ACTIVE',
      upcoming: 'UPCOMING',
      finished: 'FINISHED',
    };
    return list.filter((t) => t.status === map[filter]);
  }, [list, filter]);

  const counts = useMemo(
    () => ({
      all: list.length,
      active: list.filter((t) => t.status === 'ACTIVE').length,
      upcoming: list.filter((t) => t.status === 'UPCOMING').length,
      finished: list.filter((t) => t.status === 'FINISHED').length,
    }),
    [list],
  );

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
            Compete on the Arena
          </p>
          <h1 className="font-serif text-4xl text-ink-900">Tournaments</h1>
          <p className="mt-2 text-sm text-ink-600">
            Arena format with continuous pairing. Climb the standings and settle
            your finish onchain.
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition self-start md:self-auto"
        >
          <Plus size={16} strokeWidth={2} />
          Create Arena
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'finished', label: 'Finished' },
          ] as Array<{ id: Filter; label: string }>
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md border px-4 py-2 text-sm transition inline-flex items-center gap-2 ${
                active
                  ? 'border-gold-400 bg-parchment-50 text-gold-700 shadow-soft'
                  : 'border-parchment-300 bg-parchment-100/60 text-ink-600 hover:border-gold-300'
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                  active ? 'bg-gold-shine text-parchment-50' : 'bg-parchment-200 text-ink-400'
                }`}
              >
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-16 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gold-shine flex items-center justify-center shadow-soft">
            <Trophy size={26} className="text-parchment-50" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-serif text-2xl text-ink-900">
            No tournaments yet
          </h2>
          <p className="mt-2 text-sm text-ink-600 max-w-md mx-auto">
            Be the first to open an arena. Other players will see it instantly
            and join you for live pairings.
          </p>
          <button
            onClick={() => setModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
          >
            <Plus size={16} strokeWidth={2} />
            Open the first arena
          </button>
        </div>
      )}

      {/* Tournament cards */}
      {filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="group rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5 hover:border-gold-300 hover:shadow-gold transition"
            >
              {/* Top bar */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="h-10 w-10 rounded-md bg-gold-shine flex items-center justify-center text-parchment-50 shadow-soft">
                  <Trophy size={18} strokeWidth={1.5} />
                </div>
                <StatusPill status={t.status} />
              </div>

              {/* Name */}
              <h3 className="font-serif text-xl text-ink-900 leading-tight group-hover:text-gold-700 transition">
                {t.name}
              </h3>
              <p className="mt-1 text-xs text-ink-400">
                by{' '}
                <span className="text-ink-600">{t.createdBy.username}</span>
              </p>

              {/* Meta grid */}
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <Meta
                  icon={<Timer size={14} strokeWidth={1.5} />}
                  label="Time"
                  value={fmtTC(t.initialMs, t.incrementMs)}
                />
                <Meta
                  icon={<Users size={14} strokeWidth={1.5} />}
                  label="Players"
                  value={String(t._count.players)}
                />
                <Meta
                  icon={<Clock size={14} strokeWidth={1.5} />}
                  label="Duration"
                  value={`${Math.round(t.durationMs / 60_000)}m`}
                />
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-parchment-300 flex items-center justify-between text-xs">
                <span className="text-ink-600">
                  {t.rated ? 'Rated' : 'Casual'}
                </span>
                <span className="text-ink-400">
                  {t.status === 'ACTIVE'
                    ? `ends ${relative(t.endsAt)}`
                    : t.status === 'UPCOMING'
                    ? `starts ${relative(t.startsAt)}`
                    : 'concluded'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && (
        <CreateTournamentModal
          onClose={() => setModal(false)}
          onCreated={(id) => {
            setModal(false);
            router.push(`/tournaments/${id}`);
          }}
        />
      )}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-parchment-50 border border-parchment-300 py-2 px-1">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-ink-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-ink-900">{value}</div>
    </div>
  );
}
