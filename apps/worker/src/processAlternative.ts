import { Chess } from 'chess.js';
import { prisma } from '@omnira/db';
import { Stockfish } from '@omnira/chess-engine';

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker/alt', msg, ...extra }));
}
function logErr(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 50, comp: 'worker/alt', msg, ...extra }));
}

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length === 5 ? uci[4] : undefined;
  return { from, to, promotion };
}

/** Look up the played move + fenBefore for this match at this ply. */
async function lookupPlayedContext(matchId: string, ply: number) {
  // Prefer authoritative engineReport (already replayed); fall back to PGN replay.
  const ar = await prisma.analysisReport.findUnique({
    where: { matchId },
    select: { engineReport: true },
  });
  type PMove = { ply: number; san: string; fenBefore: string; evalAfterCp: number | null; evalAfterMate: number | null };
  const eng = ar?.engineReport as { perMove?: PMove[] } | null;
  if (eng?.perMove) {
    const e = eng.perMove.find((p) => p.ply === ply);
    if (e) return { fenBefore: e.fenBefore, playedSan: e.san, playedEvalCp: e.evalAfterCp, playedEvalMate: e.evalAfterMate };
  }

  // Fallback: replay the PGN.
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { pgn: true } });
  if (!m?.pgn) throw new Error('match has no pgn');
  const chess = new Chess();
  (chess as unknown as { loadPgn: (p: string, o?: unknown) => void }).loadPgn(m.pgn, { strict: false });
  const verbose = chess.history({ verbose: true }) as Array<{ before: string; san: string }>;
  const e = verbose[ply - 1];
  if (!e) throw new Error(`ply ${ply} not in pgn`);
  return { fenBefore: e.before, playedSan: e.san, playedEvalCp: null as number | null, playedEvalMate: null as number | null };
}

function moverIsWhite(ply: number) { return ply % 2 === 1; }

export async function processAlternative(altId: string, sf: Stockfish, depth: number) {
  const alt = await prisma.alternative.findUnique({ where: { id: altId } });
  if (!alt) return;
  log('processing', { id: alt.id, matchId: alt.matchId, ply: alt.ply, uci: alt.alternativeUci });

  try {
    const ctx = await lookupPlayedContext(alt.matchId, alt.ply);

    // Validate the alternative move is legal in fenBefore
    const c = new Chess(ctx.fenBefore);
    const mv = uciToMove(alt.alternativeUci);
    let applied;
    try {
      applied = c.move(mv);
    } catch {
      applied = null;
    }
    if (!applied) throw new Error(`alternative ${alt.alternativeUci} is not legal at ply ${alt.ply}`);
    const alternativeSan = applied.san;
    const fenAfter = c.fen();

    // Engine eval AFTER the alternative move (from opponent's POV, then flip to mover POV).
    const evalAfter = await sf.go(fenAfter, depth);
    const mover: 'w' | 'b' = moverIsWhite(alt.ply) ? 'w' : 'b';
    const opp: 'w' | 'b' = mover === 'w' ? 'b' : 'w';
    // Stockfish reports from side-to-move POV; after the alt move, side to move is opp.
    let altCp: number | null = typeof evalAfter.cp === 'number' ? evalAfter.cp : null;
    let altMate: number | null = typeof evalAfter.mate === 'number' ? evalAfter.mate : null;
    // Convert opp POV → mover POV by negating.
    if (altCp != null) altCp = -altCp;
    if (altMate != null) altMate = -altMate;

    let cpDelta: number | null = null;
    if (ctx.playedEvalCp != null && altCp != null) {
      cpDelta = altCp - ctx.playedEvalCp;
    }

    await prisma.alternative.update({
      where: { id: alt.id },
      data: {
        alternativeSan,
        fenBefore: ctx.fenBefore,
        playedSan: ctx.playedSan,
        playedEvalCp: ctx.playedEvalCp ?? null,
        playedEvalMate: ctx.playedEvalMate ?? null,
        altEvalCp: altCp,
        altEvalMate: altMate,
        cpDelta,
        status: 'COMPLETE',
        completedAt: new Date(),
      },
    });
    log('completed', { id: alt.id, alternativeSan, cpDelta, altEvalCp: altCp, altEvalMate: altMate });
  } catch (e) {
    const err = (e as Error).message;
    await prisma.alternative.update({
      where: { id: alt.id },
      data: { status: 'FAILED', errorMessage: err, completedAt: new Date() },
    });
    logErr('failed', { id: alt.id, err });
  }
}

export async function findNextAlternative(): Promise<string | null> {
  const next = await prisma.alternative.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return next?.id ?? null;
}
