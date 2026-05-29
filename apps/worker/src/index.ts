import { prisma } from '@omnira/db';
import { Stockfish } from '@omnira/chess-engine';
import { env } from './env.js';
import { analyzeOne, workerLog, workerErr } from './analyzeOne.js';
import { processAlternative, findNextAlternative } from './processAlternative.js';

async function findNext(): Promise<string | null> {
  // Matches that have ended, have a PGN, and either lack an AnalysisReport
  // OR have one with an empty llmSummary that's older than 10 minutes (retry stuck rows).
  const tenMinAgo = new Date(Date.now() - 10 * 60_000);
  const m = await prisma.match.findFirst({
    where: {
      endedAt: { not: null },
      pgn: { not: null },
      status: { in: ['WHITE_WON', 'BLACK_WON', 'DRAW'] },
      OR: [
        { analysis: { is: null } },
        {
          analysis: {
            is: { llmSummary: '', generatedAt: { lt: tenMinAgo } },
          },
        },
      ],
    },
    orderBy: { endedAt: 'asc' },
    select: { id: true },
  });
  return m?.id ?? null;
}

async function main() {
  const cfg = env();
  workerLog('worker starting', { stockfish: cfg.STOCKFISH_PATH, depth: cfg.ANALYSIS_DEPTH });

  const sf = new Stockfish({ path: cfg.STOCKFISH_PATH });
  await sf.init();
  workerLog('stockfish initialized');

  let shuttingDown = false;
  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    workerLog('shutting down');
    try { await sf.quit(); } catch {}
    try { await prisma.$disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!shuttingDown) {
    try {
      const altId = await findNextAlternative();
      if (altId) { await processAlternative(altId, sf, cfg.ANALYSIS_DEPTH); continue; }
      const id = await findNext();
      if (id) {
        try {
          await analyzeOne(id, sf);
        } catch (e) {
          workerErr('analyze failed — stubbing report so loop advances', {
            matchId: id, err: (e as Error).message,
          });
          // Write a stub so this match stops re-appearing. Phase 9B can re-run on demand.
          await prisma.analysisReport.upsert({
            where: { matchId: id },
            update: {},
            create: {
              matchId: id,
              engineReport: { error: (e as Error).message } as object,
              llmSummary: '',
              llmReport: {} as object,
            },
          });
        }
      } else {
        await new Promise((r) => setTimeout(r, cfg.ANALYSIS_POLL_MS));
      }
    } catch (e) {
      workerErr('loop error', { err: (e as Error).message });
      await new Promise((r) => setTimeout(r, cfg.ANALYSIS_POLL_MS));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
