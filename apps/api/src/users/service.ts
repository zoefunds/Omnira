import { prisma, TimeControlCategory } from '@omnira/db';

export class UserError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface PublicProfile {
  id: string;
  username: string;
  walletAddress: string | null;
  memberSince: string;
  ratings: Array<{
    category: TimeControlCategory;
    rating: number;
    gamesPlayed: number;
    ratingDev: number;
  }>;
}

export async function getProfile(usernameLower: string): Promise<PublicProfile> {
  const user = await prisma.user.findUnique({
    where: { usernameLower },
    select: {
      id: true,
      username: true,
      createdAt: true,
      wallet: { select: { address: true } },
      ratings: true,
    },
  });
  if (!user || user.id === undefined) throw new UserError('NOT_FOUND', 'no such user', 404);
  return {
    id: user.id,
    username: user.username,
    walletAddress: user.wallet?.address ?? null,
    memberSince: user.createdAt.toISOString(),
    ratings: user.ratings.map((r) => ({
      category: r.category,
      rating: r.rating,
      gamesPlayed: r.gamesPlayed,
      ratingDev: r.ratingDev,
    })),
  };
}

export async function listRecentMatches(userId: string, take = 25) {
  return prisma.match.findMany({
    where: {
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      status: { in: ['WHITE_WON', 'BLACK_WON', 'DRAW'] },
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      status: true,
      resultReason: true,
      category: true,
      initialTimeSec: true,
      incrementSec: true,
      whitePlayerId: true,
      blackPlayerId: true,
      whiteRatingBefore: true,
      blackRatingBefore: true,
      whiteRatingAfter: true,
      blackRatingAfter: true,
      tournamentId: true,
      createdAt: true,
      endedAt: true,
      whitePlayer: { select: { id: true, username: true } },
      blackPlayer: { select: { id: true, username: true } },
      analysis: { select: { matchId: true, llmSummary: true } },
    },
  });
}

/** Rating progression per category — last N matches' "ratingAfter" for this user. */
export async function getRatingHistory(userId: string, take = 50) {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      status: { in: ['WHITE_WON', 'BLACK_WON', 'DRAW'] },
    },
    orderBy: { endedAt: 'asc' },
    take,
    select: {
      endedAt: true,
      category: true,
      whitePlayerId: true,
      whiteRatingAfter: true,
      blackRatingAfter: true,
    },
  });
  const byCat: Record<string, Array<{ at: string; rating: number }>> = {};
  for (const m of matches) {
    const r = m.whitePlayerId === userId ? m.whiteRatingAfter : m.blackRatingAfter;
    if (r == null || m.endedAt == null) continue;
    (byCat[m.category] ??= []).push({ at: m.endedAt.toISOString(), rating: r });
  }
  return byCat;
}

export async function listUserTournaments(userId: string) {
  return prisma.tournamentPlayer.findMany({
    where: { userId },
    orderBy: { joinedAt: 'desc' },
    take: 50,
    select: {
      id: true, score: true, wins: true, losses: true, draws: true, withdrew: true,
      tournament: {
        select: {
          id: true, name: true, status: true, startsAt: true, endsAt: true,
          category: true, initialMs: true, incrementMs: true,
          winnerId: true,
        },
      },
    },
  });
}

export async function listAnalyzedMatches(userId: string, take = 20) {
  return prisma.match.findMany({
    where: {
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      analysis: { is: { NOT: { llmSummary: '' } } },
    },
    orderBy: { endedAt: 'desc' },
    take,
    select: {
      id: true,
      status: true,
      category: true,
      createdAt: true,
      endedAt: true,
      whitePlayer: { select: { id: true, username: true } },
      blackPlayer: { select: { id: true, username: true } },
      analysis: { select: { llmSummary: true } },
    },
  });
}
