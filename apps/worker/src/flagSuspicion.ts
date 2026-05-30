import { prisma, Prisma } from '@omnira/db';

interface EngineMove {
  ply: number;
  san: string;
  bestMoveUci: string;
  uci: string;
  cpLoss: number | null;
  classification: string;
}

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker/anticheat', msg, ...extra }));
}

interface SideStats {
  plies: number;
  cpLossTotal: number;
  topMatches: number;
}

function emptyStats(): SideStats {
  return { plies: 0, cpLossTotal: 0, topMatches: 0 };
}

function classify(side: SideStats, ratingGap: number): { themes: string[]; severity: number } | null {
  if (side.plies < 20) return null; // need enough sample
  const avgCpLoss = side.cpLossTotal / side.plies;
  const topPct = (side.topMatches / side.plies) * 100;
  const themes: string[] = [];
  let severity = 0;

  if (avgCpLoss <= 12) { themes.push('engine-like-low-cploss'); severity += 40; }
  if (topPct >= 90)    { themes.push('engine-like-top1-rate');  severity += 40; }
  if (avgCpLoss <= 8)  { severity += 10; }
  if (topPct >= 95)    { severity += 10; }
  if (ratingGap <= -400 && themes.length > 0) { themes.push('upset-suspicious'); severity += 15; }

  if (themes.length === 0) return null;
  return { themes, severity: Math.min(100, severity) };
}

export async function flagMatchIfSuspicious(matchId: string): Promise<number> {
  // Skip if already flagged
  const existing = await prisma.suspicionFlag.findFirst({ where: { matchId } });
  if (existing) return 0;

  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, whitePlayerId: true, blackPlayerId: true,
      whiteRatingBefore: true, blackRatingBefore: true,
      analysis: { select: { engineReport: true } },
    },
  });
  if (!m?.analysis?.engineReport) return 0;
  const eng = m.analysis.engineReport as { perMove?: EngineMove[] };
  if (!eng?.perMove || eng.perMove.length < 20) return 0;

  const white = emptyStats();
  const black = emptyStats();
  for (const mv of eng.perMove) {
    const isWhite = mv.ply % 2 === 1;
    const side = isWhite ? white : black;
    side.plies += 1;
    if (mv.cpLoss != null) side.cpLossTotal += mv.cpLoss;
    if (mv.bestMoveUci && mv.bestMoveUci === mv.uci) side.topMatches += 1;
  }

  const wRating = m.whiteRatingBefore ?? 1500;
  const bRating = m.blackRatingBefore ?? 1500;

  let created = 0;
  for (const [color, side, userId, gap] of [
    ['w' as const, white, m.whitePlayerId, wRating - bRating],
    ['b' as const, black, m.blackPlayerId, bRating - wRating],
  ]) {
    const verdict = classify(side, gap);
    if (!verdict) continue;
    try {
      await prisma.suspicionFlag.create({
        data: {
          matchId,
          userId,
          color,
          pliesAnalyzed: side.plies,
          avgCpLoss: side.plies > 0 ? side.cpLossTotal / side.plies : 0,
          topMovePct: side.plies > 0 ? (side.topMatches / side.plies) * 100 : 0,
          ratingGapDelta: gap,
          themes: verdict.themes,
          severity: verdict.severity,
        },
      });
      created += 1;
      log('flagged', { matchId, userId, color, severity: verdict.severity, themes: verdict.themes });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  return created;
}

export async function findMatchToFlag(): Promise<string | null> {
  // Picks a finished + analyzed match that has no SuspicionFlag yet.
  // Uses an in-memory "tried" set to avoid spinning on matches whose engine report
  // can't produce a flag (totally normal games).
  const m = await prisma.match.findFirst({
    where: {
      endedAt: { not: null },
      analysis: { is: { llmSummary: { not: '' } } },
      flagsTried: false as never, // placeholder — we use the in-memory set below
    } as never,
    orderBy: { endedAt: 'desc' },
    select: { id: true },
  }).catch(() => null);
  return m?.id ?? null;
}

const triedFlags = new Set<string>();

export async function findMatchToFlagSafe(): Promise<string | null> {
  const m = await prisma.match.findFirst({
    where: {
      endedAt: { not: null },
      analysis: { is: { llmSummary: { not: '' } } },
      suspicionFlags: { none: {} },
      ...(triedFlags.size > 0 ? { id: { notIn: Array.from(triedFlags) } } : {}),
    },
    orderBy: { endedAt: 'desc' },
    select: { id: true },
  });
  if (!m) return null;
  // Always note that we tried this match; if no flag is produced we won't see it again this session.
  triedFlags.add(m.id);
  return m.id;
}
