'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Chess, type Square } from 'chess.js';
import {
  api,
  type ApiPuzzle,
  type ApiPuzzleAttemptResponse,
  type ApiPuzzleStats,
} from '@/lib/api';
import { useAuth } from '@/store/auth';
import { loginHref } from '@/lib/loginNext';
import { usePathname } from 'next/navigation';
import {
  Puzzle,
  CheckCircle2,
  XCircle,
  SkipForward,
  Lightbulb,
  ArrowRight,
  Trophy,
  Target,
  Flame,
} from 'lucide-react';

const Chessboard = dynamic(
  () => import('react-chessboard').then((m) => m.Chessboard),
  { ssr: false },
);

type Phase = 'loading' | 'solving' | 'graded' | 'empty';

export default function PuzzlesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, hydrated } = useAuth();
  const [puzzle, setPuzzle] = useState<ApiPuzzle | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<ApiPuzzleStats | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [graded, setGraded] = useState<ApiPuzzleAttemptResponse | null>(null);
  const [startTs, setStartTs] = useState<number>(Date.now());
  // Hint state: 'none' → 'piece' (highlight the from-square) → 'square' (highlight to-square as well)
  const [hintLevel, setHintLevel] = useState<'none' | 'piece' | 'square'>('none');

  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace(loginHref(pathname));
  }, [hydrated, user, router, pathname]);

  const loadNext = useCallback(async () => {
    if (!token || !user) return;
    setPhase('loading');
    setGraded(null);
    setSelected(null);
    setHintLevel('none');
    try {
      const r = await api.getNextPuzzle(token);
      if (r && 'puzzle' in r && r.puzzle) {
        setPuzzle(r.puzzle);
        setPhase('solving');
        setStartTs(Date.now());
      } else {
        setPuzzle(null);
        setPhase('empty');
      }
      const s = await api.getPuzzleStats(user.username);
      setStats(s.stats);
    } catch (e) {
      console.warn(e);
      setPhase('empty');
    }
  }, [token, user]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const chess = useMemo(
    () => (puzzle ? new Chess(puzzle.fen) : null),
    [puzzle],
  );
  const myColor = puzzle?.sideToMove ?? 'w';

  const legalTargets: Set<string> = useMemo(() => {
    if (!chess || !selected) return new Set();
    return new Set(
      (
        chess.moves({ square: selected, verbose: true }) as Array<{
          to: string;
        }>
      ).map((m) => m.to),
    );
  }, [chess, selected]);

  function isMyPieceOn(square: Square): boolean {
    if (!chess) return false;
    const piece = chess.get(square);
    return !!piece && piece.color === myColor;
  }

  async function trySubmit(from: Square, to: Square, promotion?: string) {
    if (!chess || !puzzle || !token || phase !== 'solving') return;
    const uci = `${from}${to}${promotion ?? ''}`;
    const result: 'CORRECT' | 'WRONG' =
      uci === puzzle.solutionUci ? 'CORRECT' : 'WRONG';
    const thinkMs = Date.now() - startTs;
    setPhase('loading');
    const grade = await api.submitPuzzleAttempt(
      { puzzleId: puzzle.id, submittedUci: uci, result, thinkMs },
      token,
    );
    setGraded(grade);
    setPhase('graded');
    if (user) {
      const s = await api.getPuzzleStats(user.username);
      setStats(s.stats);
    }
  }

  async function skip() {
    if (!puzzle || !token || phase !== 'solving') return;
    setPhase('loading');
    const grade = await api.submitPuzzleAttempt(
      {
        puzzleId: puzzle.id,
        result: 'SKIPPED',
        thinkMs: Date.now() - startTs,
      },
      token,
    );
    setGraded(grade);
    setPhase('graded');
  }

  function onSquareClick(square: Square) {
    if (!chess || phase !== 'solving') return;
    if (!selected) {
      if (isMyPieceOn(square)) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (isMyPieceOn(square)) {
      setSelected(square);
      return;
    }
    if (legalTargets.has(square)) {
      const moving = chess.get(selected);
      const promo =
        moving &&
        moving.type === 'p' &&
        ((moving.color === 'w' && square[1] === '8') ||
          (moving.color === 'b' && square[1] === '1'))
          ? 'q'
          : undefined;
      void trySubmit(selected, square, promo);
      setSelected(null);
      return;
    }
    setSelected(null);
  }

  if (!user) return null;

  /* ───── Loading ───── */
  if (phase === 'loading') {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-parchment-200 border border-parchment-300 flex items-center justify-center">
            <Puzzle
              size={20}
              className="text-gold-600 animate-pulse"
              strokeWidth={1.5}
            />
          </div>
          <p className="mt-4 text-sm text-ink-600">Loading next puzzle.</p>
        </div>
      </div>
    );
  }

  /* ───── Empty state ───── */
  if (phase === 'empty') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Header stats={stats} />
        <div className="mt-8 rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-16 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gold-shine flex items-center justify-center shadow-soft">
            <CheckCircle2
              size={26}
              className="text-parchment-50"
              strokeWidth={1.5}
            />
          </div>
          <h2 className="mt-5 font-serif text-2xl text-ink-900">
            You&apos;ve cleared the board
          </h2>
          <p className="mt-2 text-sm text-ink-600 max-w-md mx-auto">
            Every published puzzle is already in your attempt history. New
            tactics surface as more games finish across Omnira. Check back soon.
          </p>
          <button
            onClick={loadNext}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
          >
            Try again
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (!puzzle || !chess) return null;

  /* ───── Board styles ───── */
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = { background: 'rgba(184,144,31,0.25)' };
    for (const t of legalTargets) {
      const occ = !!chess.get(t as Square);
      squareStyles[t] = occ
        ? { boxShadow: 'inset 0 0 0 4px rgba(161,58,46,0.45)' }
        : {
            background:
              'radial-gradient(circle, rgba(184,144,31,0.45) 18%, transparent 22%)',
          };
    }
  }
  // Hint overlay — gold ring on the from-square (level 'piece') and additionally
  // on the to-square (level 'square'). We don't disrupt the existing selection
  // styles; if there's overlap the hint just stacks on top.
  if (hintLevel !== 'none' && puzzle.solutionUci.length >= 4) {
    const fromSq = puzzle.solutionUci.slice(0, 2);
    squareStyles[fromSq] = {
      ...(squareStyles[fromSq] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(184,144,31,0.85)',
    };
    if (hintLevel === 'square') {
      const toSq = puzzle.solutionUci.slice(2, 4);
      squareStyles[toSq] = {
        ...(squareStyles[toSq] ?? {}),
        boxShadow: 'inset 0 0 0 4px rgba(184,144,31,0.85)',
      };
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Header stats={stats} />

      <div className="mt-8 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Board */}
        <div>
          <div className="rounded-xl overflow-hidden shadow-card border border-parchment-300">
            <Chessboard
              position={puzzle.fen}
              boardOrientation={myColor === 'w' ? 'white' : 'black'}
              arePiecesDraggable={false}
              onSquareClick={onSquareClick}
              customSquareStyles={squareStyles}
              customBoardStyle={{ borderRadius: '0.75rem' }}
              customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
              customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-ink-600">
              <span className="font-medium text-ink-900">
                {myColor === 'w' ? 'White' : 'Black'}
              </span>{' '}
              to move. Find the best move.
            </div>
            {phase === 'solving' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setHintLevel((h) =>
                      h === 'none' ? 'piece' : h === 'piece' ? 'square' : 'square',
                    )
                  }
                  disabled={hintLevel === 'square'}
                  title={
                    hintLevel === 'none'
                      ? 'Highlight the piece to move'
                      : hintLevel === 'piece'
                      ? 'Highlight the target square'
                      : 'No more hints — submit your move'
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-gold-300 bg-parchment-50 px-3 py-2 text-sm text-gold-700 hover:bg-gold-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lightbulb size={14} strokeWidth={1.5} />
                  {hintLevel === 'none'
                    ? 'Hint'
                    : hintLevel === 'piece'
                    ? 'Show target'
                    : 'Hint used'}
                </button>
                <button
                  onClick={skip}
                  className="inline-flex items-center gap-2 rounded-md border border-parchment-400 px-4 py-2 text-sm text-ink-600 hover:border-ink-900 hover:text-ink-900 transition"
                >
                  <SkipForward size={14} strokeWidth={1.5} />
                  Skip
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside className="space-y-5">
          {/* Current puzzle */}
          <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-400">
                  This puzzle
                </div>
                <div className="mt-1 font-serif text-4xl text-ink-900">
                  {puzzle.rating}
                </div>
              </div>
              <div className="h-9 w-9 rounded-md bg-parchment-50 border border-parchment-300 flex items-center justify-center text-gold-600">
                <Target size={16} strokeWidth={1.5} />
              </div>
            </div>
            {puzzle.themes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {puzzle.themes.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] rounded-full bg-parchment-50 border border-parchment-300 px-2 py-0.5 text-ink-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Your stats */}
          {stats && (
            <div className="rounded-xl border border-parchment-300 bg-parchment-100/60 shadow-card p-5">
              <div className="text-xs uppercase tracking-wider text-ink-400">
                Your puzzle rating
              </div>
              <div className="mt-1 font-serif text-4xl text-ink-900">
                {stats.rating}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-md bg-parchment-50 border border-parchment-300 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">
                    Solved
                  </div>
                  <div className="font-mono text-lg text-ink-900">
                    {stats.solved}
                  </div>
                </div>
                <div className="rounded-md bg-parchment-50 border border-parchment-300 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">
                    Attempted
                  </div>
                  <div className="font-mono text-lg text-ink-900">
                    {stats.attempted}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grade card */}
          {phase === 'graded' && graded && (
            <div
              className={`rounded-xl border p-5 shadow-card ${
                graded.result === 'CORRECT'
                  ? 'border-gold-300 bg-parchment-50'
                  : graded.result === 'WRONG'
                  ? 'border-danger/30 bg-parchment-50'
                  : 'border-parchment-300 bg-parchment-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {graded.result === 'CORRECT' ? (
                  <CheckCircle2
                    size={22}
                    className="text-gold-600"
                    strokeWidth={1.5}
                  />
                ) : graded.result === 'WRONG' ? (
                  <XCircle
                    size={22}
                    className="text-danger"
                    strokeWidth={1.5}
                  />
                ) : (
                  <SkipForward
                    size={22}
                    className="text-ink-400"
                    strokeWidth={1.5}
                  />
                )}
                <span
                  className={`font-medium ${
                    graded.result === 'CORRECT'
                      ? 'text-gold-700'
                      : graded.result === 'WRONG'
                      ? 'text-danger'
                      : 'text-ink-600'
                  }`}
                >
                  {graded.result === 'CORRECT'
                    ? 'Correct'
                    : graded.result === 'WRONG'
                    ? 'Engine prefers a different move'
                    : 'Skipped'}
                </span>
              </div>
              <div className="mt-3 text-xs text-ink-600">
                Solution:{' '}
                <span className="font-mono text-ink-900">
                  {graded.solutionSan}
                </span>
              </div>
              <button
                onClick={loadNext}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-gold-shine px-5 py-2.5 text-sm font-medium uppercase tracking-wide text-parchment-50 shadow-soft hover:opacity-90 transition"
              >
                Next puzzle
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Header({ stats }: { stats: ApiPuzzleStats | null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-700 mb-2">
          Daily Tactics
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900">Puzzles</h1>
        <p className="mt-2 text-sm text-ink-600">
          Sharpen your pattern recognition with engine-curated positions.
        </p>
      </div>
      {stats && (
        <div className="flex items-center gap-3">
          <Stat
            icon={<Trophy size={14} strokeWidth={1.5} />}
            label="Rating"
            value={String(stats.rating)}
          />
          <Stat
            icon={<CheckCircle2 size={14} strokeWidth={1.5} />}
            label="Solved"
            value={String(stats.solved)}
          />
          <Stat
            icon={<Flame size={14} strokeWidth={1.5} />}
            label="Attempted"
            value={String(stats.attempted)}
          />
        </div>
      )}
    </header>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-parchment-300 bg-parchment-100/60 px-3 py-2 min-w-[80px]">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-400">
        {icon}
        {label}
      </div>
      <div className="font-mono text-lg text-ink-900 leading-none mt-1">
        {value}
      </div>
    </div>
  );
}
