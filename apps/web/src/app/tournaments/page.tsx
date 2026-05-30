'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiTournament } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/Button';
import { CreateTournamentModal } from '@/components/CreateTournamentModal';

function fmtTC(initialMs: number, incrementMs: number) {
  return `${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}

function relative(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return `${Math.round(-ms / 60_000)}m ago`;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  return `in ${h}h`;
}

function StatusPill({ status }: { status: ApiTournament['status'] }) {
  const map = {
    UPCOMING: 'bg-parchment-300 text-ink-600',
    ACTIVE: 'bg-accent/20 text-accent',
    FINISHED: 'bg-parchment-200 text-ink-400',
    CANCELLED: 'bg-danger/20 text-danger',
  } as const;
  return (
    <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${map[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

export default function TournamentsPage() {
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const [list, setList] = useState<ApiTournament[]>([]);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  async function refresh() {
    const r = await api.listTournaments();
    setList(r.tournaments);
  }
  useEffect(() => { void refresh(); const id = setInterval(refresh, 10_000); return () => clearInterval(id); }, []);

  if (!user) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Tournaments</h1>
          <p className="text-sm text-ink-600">Arena format · continuous pairing</p>
        </div>
        <Button onClick={() => setModal(true)}>+ Create arena</Button>
      </div>

      <div className="rounded-xl border border-parchment-300 bg-parchment-100 divide-y divide-parchment-300">
        {list.length === 0 && <div className="p-5 text-sm text-ink-400">No tournaments yet — be the first.</div>}
        {list.map((t) => (
          <Link key={t.id} href={`/tournaments/${t.id}`} className="block p-4 hover:bg-parchment-50 transition">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-serif text-lg text-ink-900">{t.name}</div>
                  <StatusPill status={t.status} />
                </div>
                <div className="text-xs text-ink-600 mt-0.5">
                  by <span className="text-ink-900">{t.createdBy.username}</span>
                  <span className="mx-2 text-ink-400">·</span>
                  <span className="font-mono">{fmtTC(t.initialMs, t.incrementMs)}</span>
                  <span className="mx-2 text-ink-400">·</span>
                  {t.rated ? 'rated' : 'casual'}
                  <span className="mx-2 text-ink-400">·</span>
                  {Math.round(t.durationMs / 60_000)} min
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-ink-900 font-mono">{t._count.players}</div>
                <div className="text-[10px] uppercase text-ink-400">players</div>
              </div>
              <div className="text-right ml-4 min-w-[64px]">
                <div className="text-xs text-ink-600">{relative(t.startsAt)}</div>
                <div className="text-[10px] text-ink-400">{t.status === 'ACTIVE' ? `ends ${relative(t.endsAt)}` : 'starts'}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {modal && (
        <CreateTournamentModal
          onClose={() => setModal(false)}
          onCreated={(id) => { setModal(false); router.push(`/tournaments/${id}`); }}
        />
      )}
    </section>
  );
}
