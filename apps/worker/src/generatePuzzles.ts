import { Chess } from 'chess.js';
import { prisma, Prisma } from '@omnira/db';

interface EngineMove {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  bestMoveUci: string;
  bestMoveSan: string;
  evalBeforeCp: number | null;
  evalBeforeMate: number | null;
  cpLoss: number | null;
  classification: 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';
}

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker/puzzles', msg, ...extra }));
}

function inferThemes(fenBefore: string, bestUci: string, evalAfterSolutionMate: number | null): string[] {
  const t: string[] = [];
  try {
    const c = new Chess(fenBefore);
    if (c.inCheck()) t.push('in-check');
    const m = c.move({
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      promotion: bestUci.length === 5 ? bestUci[4] : undefined,
    });
    if (m?.captured) t.push('capture');
    if (m?.promotion) t.push('promotion');
    if (c.isCheckmate()) t.push('mate-in-1');
    else if (c.inCheck()) t.push('forcing-check');
  } catch {/* ignore */}
  if (evalAfterSolutionMate != null && evalAfterSolutionMate > 0) t.push('winning-mate');
  return t;
}

export async function generatePuzzlesForMatch(matchId: string): Promise<number> {
  const ar = await prisma.analysisReport.findUnique({
    where: { matchId },
    select: { engineReport: true },
  });
  if (!ar) return 0;
  const eng = ar.engineReport as { perMove?: EngineMove[] };
  if (!eng?.perMove) return 0;

  let created = 0;
  for (const m of eng.perMove) {
    if (m.classification !== 'blunder' && m.classification !== 'mistake') continue;
    if (!m.fenBefore || !m.bestMoveUci || m.bestMoveUci === '(none)') continue;

    const cpLoss = m.cpLoss ?? 0;
    // Test the solution to figure out if it's FORCING (check / capture / mate).
    let isCheck = false, isCapture = false, isMate = false;
    try {
      const c = new Chess(m.fenBefore);
      const mv = c.move({
        from: m.bestMoveUci.slice(0, 2),
        to: m.bestMoveUci.slice(2, 4),
        promotion: m.bestMoveUci.length === 5 ? m.bestMoveUci[4] : undefined,
      });
      isCapture = !!mv?.captured;
      isCheck = c.inCheck();
      isMate = c.isCheckmate();
    } catch {/* ignore */}

    // Quality gate — keep only puzzles where the answer is clearly forced:
    //   - mate-in-1 (always great)
    //   - cpLoss >= 200 (huge blunder, almost always a clean tactic)
    //   - cpLoss >= 150 AND solution is forcing (check or capture)
    const keep =
      isMate ||
      cpLoss >= 200 ||
      (cpLoss >= 100 && (isCheck || isCapture));
    if (!keep) continue;

    const sideToMove = m.fenBefore.split(' ')[1] === 'b' ? 'b' : 'w';
    const themes = ['blunder'];
    if (m.classification === 'mistake') themes[0] = 'mistake';
    themes.push(...inferThemes(m.fenBefore, m.bestMoveUci, null));

    // Initial puzzle rating proxy: scale cpLoss into [1200, 2200].
    const cap = Math.min(800, Math.max(80, m.cpLoss ?? 100));
    const rating = Math.round(1200 + (cap / 800) * 1000);

    try {
      await prisma.puzzle.create({
        data: {
          fen: m.fenBefore,
          sideToMove,
          solutionUci: m.bestMoveUci,
          solutionSan: m.bestMoveSan ?? m.bestMoveUci,
          evalCp: m.evalBeforeCp,
          evalMate: m.evalBeforeMate,
          playedUci: m.uci,
          playedSan: m.san,
          cpLoss: m.cpLoss ?? null,
          themes,
          rating,
          sourceMatchId: matchId,
          sourcePly: m.ply,
          publishedAt: new Date(),
        },
      });
      created += 1;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  if (created > 0) log('generated', { matchId, created });
  return created;
}

/** Polling loop: find matches with analysis but no puzzles yet, and generate. */
export async function findMatchForPuzzleGen(): Promise<string | null> {
  const t0 = Date.now();
  const m = await prisma.match.findFirst({
    where: {
      analysis: { is: { llmSummary: { not: '' } } },
      puzzles: { none: {} },
    },
    orderBy: { endedAt: 'desc' },
    select: { id: true },
  });
  console.log(JSON.stringify({ level: 30, comp: 'worker/puzzles', msg: 'pick', matchId: m?.id ?? null, ms: Date.now() - t0 }));
  return m?.id ?? null;
}
