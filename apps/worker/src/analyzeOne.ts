import { prisma } from '@omnira/db';
import { Stockfish, analyzeGame } from '@omnira/chess-engine';
import { env } from './env.js';

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker', msg, ...extra }));
}
function logErr(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 50, comp: 'worker', msg, ...extra }));
}

export async function analyzeOne(matchId: string, sf: Stockfish): Promise<void> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, pgn: true, status: true },
  });
  if (!m) return;
  if (!m.pgn || m.pgn.trim().length === 0) {
    log('skip: no pgn', { matchId });
    return;
  }

  const cfg = env();
  log('analyzing', { matchId, status: m.status, depth: cfg.ANALYSIS_DEPTH });
  const t0 = Date.now();
  const report = await analyzeGame(m.pgn, sf, cfg.ANALYSIS_DEPTH);
  const ms = Date.now() - t0;

  await prisma.analysisReport.upsert({
    where: { matchId },
    update: {
      engineReport: report as unknown as object,
      llmSummary: '',     // populated in Phase 9B
      llmReport: {} as object,
    },
    create: {
      matchId,
      engineReport: report as unknown as object,
      llmSummary: '',
      llmReport: {} as object,
    },
  });

  log('analyzed', {
    matchId, ms,
    whiteAccuracy: Math.round(report.whiteAccuracy),
    blackAccuracy: Math.round(report.blackAccuracy),
    whiteCounts: report.whiteCounts, blackCounts: report.blackCounts,
  });
}

export { log as workerLog, logErr as workerErr };
