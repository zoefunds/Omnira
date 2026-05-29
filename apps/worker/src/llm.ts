import { prisma } from '@omnira/db';
import type { GameAnalysis } from '@omnira/chess-engine';
import { requestLlmAnalysis, oracleConfigured } from './onchain.js';

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker/llm', msg, ...extra }));
}
function logErr(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 50, comp: 'worker/llm', msg, ...extra }));
}

/** One short line per ply: `ply. SAN  eval  [class, best=BEST, cpL=N]` */
export function summarizeForPrompt(g: GameAnalysis): string {
  const lines: string[] = [];
  lines.push(`depth=${g.depth} whiteAcc=${g.whiteAccuracy.toFixed(0)} blackAcc=${g.blackAccuracy.toFixed(0)}`);
  for (const m of g.perMove) {
    const evalStr = m.evalAfterMate != null
      ? `#${m.evalAfterMate}`
      : (m.evalAfterCp != null ? (m.evalAfterCp / 100).toFixed(2) : '-');
    const extra = m.classification === 'good' || m.classification === 'book'
      ? m.classification
      : `${m.classification}, best=${m.bestMoveSan}, cpL=${m.cpLoss ?? '-'}`;
    lines.push(`${m.ply}. ${m.san}  ${evalStr}  [${extra}]`);
  }
  return lines.join('\n');
}

/** Strip ```json fences, trim, parse. Returns null on failure. */
function tryParseJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  // Strip markdown fences just in case the model added them.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Find the outermost {...}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runLlmAnalysis(
  matchId: string,
  engineReport: GameAnalysis,
  pgn: string,
): Promise<void> {
  if (!oracleConfigured()) {
    log('oracle not configured — skipping LLM analysis');
    return;
  }
  log('requesting LLM analysis onchain', { matchId });
  const t0 = Date.now();
  const summary = summarizeForPrompt(engineReport);

  let raw: string;
  try {
    raw = await requestLlmAnalysis(matchId, summary, pgn);
  } catch (e) {
    logErr('onchain LLM request failed', { matchId, err: (e as Error).message });
    return;
  }
  const ms = Date.now() - t0;
  const parsed = tryParseJson(raw);

  await prisma.analysisReport.update({
    where: { matchId },
    data: {
      llmSummary: parsed && typeof parsed.summary === 'string' ? (parsed.summary as string) : raw.slice(0, 1000),
      llmReport: (parsed ?? { raw }) as object,
    },
  });

  log('LLM analysis stored', {
    matchId, ms,
    parsed: parsed != null,
    bytes: raw.length,
  });
}
