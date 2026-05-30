'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Chess, type Square } from 'chess.js';
import { api, type ApiPuzzle, type ApiPuzzleAttemptResponse, type ApiPuzzleStats } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/Button';

const Chessboard = dynamic(() => import('react-chessboard').then((m) => m.Chessboard), { ssr: false });

type Phase = 'loading' | 'solving' | 'graded' | 'empty';

export default function PuzzlesPage() {
  const router = useRouter();
  const { user, token, hydrated } = useAuth();
  const [puzzle, setPuzzle] = useState<ApiPuzzle | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<ApiPuzzleStats | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [graded, setGraded] = useState<ApiPuzzleAttemptResponse | null>(null);
  const [startTs, setStartTs] = useState<number>(Date.now());

  useEffect(() => { if (!hydrated) return; if (!user) router.replace('/login'); }, [hydrated, user, router]);

  const loadNext = useCallback(async () => {
    if (!token || !user) return;
    setPhase('loading'); setGraded(null); setSelected(null);
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

  useEffect(() => { void loadNext(); }, [loadNext]);

  const chess = useMemo(() => (puzzle ? new Chess(puzzle.fen) : null), [puzzle]);
  const myColor = puzzle?.sideToMove ?? 'w';

  const legalTargets: Set<string> = useMemo(() => {
    if (!chess || !selected) return new Set();
    return new Set((chess.moves({ square: selected, verbose: true }) as Array<{ to: string }>).map((m) => m.to));
  }, [chess, selected]);

  function isMyPieceOn(square: Square): boolean {
    if (!chess) return false;
    const piece = chess.get(square);
    return !!piece && piece.color === myColor;
  }

  async function trySubmit(from: Square, to: Square, promotion?: string) {
    if (!chess || !puzzle || !token || phase !== 'solving') return;
    const uci = `${from}${to}${promotion ?? ''}`;
    const result: 'CORRECT' | 'WRONG' = uci === puzzle.solutionUci ? 'CORRECT' : 'WRONG';
    const thinkMs = Date.now() - startTs;
    setPhase('loading');
    const grade = await api.submitPuzzleAttempt({ puzzleId: puzzle.id, submittedUci: uci, result, thinkMs }, token);
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
    const grade = await api.submitPuzzleAttempt({ puzzleId: puzzle.id, result: 'SKIPPED', thinkMs: Date.now() - startTs }, token);
    setGraded(grade);
    setPhase('graded');
  }

  function onSquareClick(square: Square) {
    if (!chess || phase !== 'solving') return;
    if (!selected) {
      if (isMyPieceOn(square)) setSelected(square);
      return;
    }
    if (selected === square) { setSelected(null); return; }
    if (isMyPieceOn(square)) { setSelected(square); return; }
    if (legalTargets.has(square)) {
      const moving = chess.get(selected);
      const promo = (moving && moving.type === 'p' && ((moving.color === 'w' && square[1] === '8') || (moving.color === 'b' && square[1] === '1'))) ? 'q' : undefined;
      void trySubmit(selected, square, promo);
      setSelected(null);
      return;
    }
    setSelected(null);
  }

  if (!user) return null;
  if (phase === 'loading') return <div className="text-ink-600 text-sm">Loading puzzle…</div>;

  if (phase === 'empty') {
    return (
      <section className="max-w-md">
        <h1 className="font-serif text-3xl text-ink-900">Puzzles</h1>
        <p className="mt-3 text-sm text-ink-600">
          No more puzzles available — every published puzzle is in your attempt history,
          or the generator hasn't surfaced new ones yet. Come back after more games finish.
        </p>
        <Button className="mt-4" onClick={loadNext}>Try again</Button>
      </section>
    );
  }

  if (!puzzle || !chess) return null;

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = { background: 'rgba(47,107,79,0.35)' };
    for (const t of legalTargets) {
      const occ = !!chess.get(t as Square);
      squareStyles[t] = occ
        ? { boxShadow: 'inset 0 0 0 4px rgba(161,58,46,0.55)' }
        : { background: 'radial-gradient(circle, rgba(47,107,79,0.45) 18%, transparent 22%)' };
    }
  }

  return (
    <section className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="max-w-[640px] w-full">
        <div className="rounded-xl overflow-hidden shadow-soft">
          <Chessboard
            position={puzzle.fen}
            boardOrientation={myColor === 'w' ? 'white' : 'black'}
            arePiecesDraggable={false}
            onSquareClick={onSquareClick}
            customSquareStyles={squareStyles}
            customBoardStyle={{ borderRadius: '0.875rem' }}
            customDarkSquareStyle={{ backgroundColor: '#a89f7b' }}
            customLightSquareStyle={{ backgroundColor: '#f1ecd9' }}
          />
        </div>
        <div className="mt-3 text-sm text-ink-600">
          <span className="font-medium text-ink-900">{myColor === 'w' ? 'White' : 'Black'}</span> to move · find the best move.
        </div>
      </div>

      <aside className="w-full lg:w-80 space-y-4">
        <div className="rounded-xl border border-parchment-300 bg-parchment-100 p-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-400">Puzzle</div>
          <div className="mt-1 font-mono text-2xl text-ink-900">{puzzle.rating}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {puzzle.themes.map((t) => (
              <span key={t} className="text-[11px] rounded-full bg-parchment-200 border border-parchment-300 px-2 py-0.5 text-ink-600">{t}</span>
            ))}
          </div>
        </div>

        {stats && (
          <div className="rounded-xl border border-parchment-300 bg-parchment-100 p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-400">Your puzzle rating</div>
            <div className="mt-1 font-mono text-2xl text-ink-900">{stats.rating}</div>
            <div className="mt-1 text-xs text-ink-600">{stats.solved} solved · {stats.attempted} attempted</div>
          </div>
        )}

        {phase === 'graded' && graded && (
          <div className={`rounded-xl border p-4 ${graded.result === 'CORRECT' ? 'border-accent/40 bg-parchment-50' : 'border-danger/40 bg-parchment-50'}`}>
            <div className={`text-sm font-medium ${graded.result === 'CORRECT' ? 'text-accent' : 'text-danger'}`}>
              {graded.result === 'CORRECT' ? 'Correct ✓' : graded.result === 'WRONG' ? 'Engine prefers a different move' : 'Skipped'}
            </div>
            <div className="mt-2 text-xs text-ink-600">
              Solution: <span className="font-mono text-ink-900">{graded.solutionSan}</span>
            </div>
            <Button className="mt-3 w-full" onClick={loadNext}>Next puzzle</Button>
          </div>
        )}

        {phase === 'solving' && (
          <Button variant="ghost" onClick={skip} className="w-full">Skip puzzle</Button>
        )}
      </aside>
    </section>
  );
}
