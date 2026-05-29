import { prisma, TimeControlCategory, MatchStatus, MatchResultReason } from '@omnira/db';

export async function createMatch(args: {
  whitePlayerId: string;
  blackPlayerId: string;
  category: TimeControlCategory;
  initialMs: number;
  incrementMs: number;
  whiteRatingBefore: number;
  blackRatingBefore: number;
}) {
  return prisma.match.create({
    data: {
      whitePlayerId: args.whitePlayerId,
      blackPlayerId: args.blackPlayerId,
      category: args.category,
      initialTimeSec: Math.floor(args.initialMs / 1000),
      incrementSec: Math.floor(args.incrementMs / 1000),
      status: 'ACTIVE',
      startedAt: new Date(),
      whiteRatingBefore: args.whiteRatingBefore,
      blackRatingBefore: args.blackRatingBefore,
    },
  });
}

export async function recordMove(args: {
  matchId: string;
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  clockMsWhite: number;
  clockMsBlack: number;
  thinkMs: number;
}) {
  return prisma.move.create({ data: args });
}

export async function endMatch(args: {
  matchId: string;
  status: Exclude<MatchStatus, 'PENDING' | 'ACTIVE'>;
  reason: MatchResultReason;
  finalFen: string;
  pgn: string;
  whiteRatingAfter: number;
  blackRatingAfter: number;
}) {
  return prisma.match.update({
    where: { id: args.matchId },
    data: {
      status: args.status,
      resultReason: args.reason,
      finalFen: args.finalFen,
      pgn: args.pgn,
      whiteRatingAfter: args.whiteRatingAfter,
      blackRatingAfter: args.blackRatingAfter,
      endedAt: new Date(),
    },
  });
}

export async function updateRating(args: {
  userId: string;
  category: TimeControlCategory;
  newRating: number;
}) {
  return prisma.rating.update({
    where: { userId_category: { userId: args.userId, category: args.category } },
    data: { rating: args.newRating, gamesPlayed: { increment: 1 } },
  });
}
