'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api, type ApiMatchState } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSocket } from '@/hooks/useSocket';

const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), { ssr: false });

interface MoveItem {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  clockMsWhite: number;
  clockMsBlack: number;
}

function fmtTC(initialSec: number, incrementSec: number) {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}
function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function WatchMatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const token = useAuth((s) => s.token);
  const socket = useSocket(token);
  const [m, setM] = useState<ApiMatchState | null>(null);
  const [history, setHistory] = useState<MoveItem[]>([]);
  const [fen, setFen] = useState<string | null>(null);

  // Initial state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMatchState(matchId);
        if (cancelled) return;
        setM(r.match);
        setHistory(r.match.moves);
        setFen(r.match.currentFen ?? r.match.finalFen ?? null);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  // Subscribe to live updates
  useEffect(() => {
    if (!socket) return;
    socket.emit('match:watch', { matchId }, () => {});

    const onMove = (p: { matchId: string; ply: number; san: string; uci: string; fenAfter: string; whiteMs: number; blackMs: number }) => {
      if (p.matchId !== matchId) return;
      setHistory((prev) => {
        if (prev.some((x) => x.ply === p.ply)) return prev;
        return [...prev, {
          ply: p.ply, san: p.san, uci: p.uci, fenAfter: p.fenAfter,
          clockMsWhite: p.whiteMs, clockMsBlack: p.blackMs,
        }];
      });
      setFen(p.fenAfter);
    };
    const onEnd = (p: { matchId: string; outcome: string; reason: string }) => {
      if (p.matchId !== matchId) return;
      setM((prev) => prev ? { ...prev, status: p.outcome, resultReason: p.reason } : prev);
    };

    socket.on('match:move', onMove);
    socket.on('match:end', onEnd);
    return () => {
      socket.emit('match:unwatch', { matchId }, () => {});
      socket.off('match:move', onMove);
      socket.off('match:end', onEnd);
    };
  }, [socket, matchId]);

  if (!m)
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center text-sm text-ink-600">
        Loading.
      </div>
    );

  const rows: Array<{ n: number; w?: string; b?: string }> = [];
  for (const it of history) {
    const n = Math.ceil(it.ply / 2);
    let r = rows[rows.length - 1];
    if (!r || r.n !== n) { r = { n }; rows.push(r); }
    if (it.ply % 2 === 1) r.w = it.san; else r.b = it.san;
  }
  const last = history[history.length - 1];
  const whiteMs = last?.clockMsWhite ?? m.initialTimeSec * 1000;
  const blackMs = last?.clockMsBlack ?? m.initialTimeSec * 1000;
  const ended = m.status !== 'ACTIVE' && m.status !== 'PENDING';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid lg:grid-cols-[1fr_auto] gap-5 lg:gap-6 items-start">
      <div className="max-w-full lg:max-w-[640px] w-full mx-auto">
        <div className="mb-3 rounded-xl border border-parchment-300 bg-parchment-100 px-4 py-2 flex items-baseline justify-between">
          <Link href={`/u/${m.blackPlayer.username}`} className="text-ink-900 hover:underline">{m.blackPlayer.username}</Link>
          <span className="font-mono text-ink-900">{fmtMs(blackMs)}</span>
        </div>
        <div className="rounded-xl overflow-hidden shadow-soft">
          <Chessboard
            position={fen ?? undefined}
            arePiecesDraggable={false}
            customBoardStyle={{ borderRadius: '0.875rem' }}
            customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
            customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
          />
        </div>
        <div className="mt-3 rounded-xl border border-parchment-300 bg-parchment-100 px-4 py-2 flex items-baseline justify-between">
          <Link href={`/u/${m.whitePlayer.username}`} className="text-ink-900 hover:underline">{m.whitePlayer.username}</Link>
          <span className="font-mono text-ink-900">{fmtMs(whiteMs)}</span>
        </div>

        <div className="mt-3 text-xs text-ink-400 flex items-center gap-4">
          <span>{fmtTC(m.initialTimeSec, m.incrementSec)} · {m.category.toLowerCase()}</span>
          {ended && <span className="text-ink-900">{m.status.replace('_', ' ').toLowerCase()} · {m.resultReason?.toLowerCase()}</span>}
          {m.tournamentId && (
            <Link href={`/tournaments/${m.tournamentId}`} className="text-accent hover:underline">tournament</Link>
          )}
        </div>
      </div>

      <aside className="w-full lg:w-72 rounded-xl border border-parchment-300 bg-parchment-100 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">Moves</div>
        <ol className="max-h-[28rem] overflow-y-auto font-mono text-sm text-ink-900 space-y-0.5">
          {rows.length === 0 && <li className="text-ink-400">·</li>}
          {rows.map((r) => (
            <li key={r.n} className="flex gap-3">
              <span className="w-6 text-right text-ink-400">{r.n}.</span>
              <span className="w-16">{r.w ?? ''}</span>
              <span className="w-16">{r.b ?? ''}</span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
