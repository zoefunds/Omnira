import { prisma, PuzzleAttemptResult, Prisma } from '@omnira/db';
import { glickoUpdate } from './glicko.js';

export class PuzzleError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

/** Pick a puzzle within ±200 rating of the user's puzzle rating, never attempted before. */
export async function pickNextForUser(userId: string) {
  const rating = await prisma.puzzleRating.findUnique({ where: { userId } });
  const r = rating?.rating ?? 1500;

  for (const window of [200, 400, 800, 1600, 3000]) {
    const candidate = await prisma.puzzle.findFirst({
      where: {
        publishedAt: { not: null },
        rating: { gte: r - window, lte: r + window },
        records: { none: { userId } },
      },
      orderBy: { attempts: 'asc' }, // surface fresh puzzles
    });
    if (candidate) {
      return {
        id: candidate.id,
        fen: candidate.fen,
        sideToMove: candidate.sideToMove,
        themes: candidate.themes,
        rating: candidate.rating,
      };
    }
  }
  return null;
}

export async function submitAttempt(args: {
  puzzleId: string;
  userId: string;
  submittedUci: string | null;
  result: 'CORRECT' | 'WRONG' | 'SKIPPED';
  thinkMs: number;
}) {
  const puzzle = await prisma.puzzle.findUnique({ where: { id: args.puzzleId } });
  if (!puzzle) throw new PuzzleError('NOT_FOUND', 'no such puzzle', 404);

  // Glicko-lite update — skipping counts as wrong with no rating change.
  let userRating = await prisma.puzzleRating.findUnique({ where: { userId: args.userId } });
  if (!userRating) {
    userRating = await prisma.puzzleRating.create({ data: { userId: args.userId } });
  }

  let userRatingAfter = userRating.rating;
  let userRatingDevAfter = userRating.ratingDev;
  let puzzleRatingAfter = puzzle.rating;
  let puzzleRatingDevAfter = puzzle.ratingDev;

  if (args.result !== 'SKIPPED') {
    const score: 0 | 1 = args.result === 'CORRECT' ? 1 : 0;
    const u = glickoUpdate(userRating.rating, userRating.ratingDev, puzzle.rating, puzzle.ratingDev, score);
    const p = glickoUpdate(puzzle.rating, puzzle.ratingDev, userRating.rating, userRating.ratingDev, (1 - score) as 0 | 1);
    userRatingAfter = u.rating;
    userRatingDevAfter = u.ratingDev;
    puzzleRatingAfter = p.rating;
    puzzleRatingDevAfter = p.ratingDev;
  }

  await prisma.$transaction([
    prisma.puzzleAttempt.create({
      data: {
        puzzleId: args.puzzleId,
        userId: args.userId,
        result: args.result as PuzzleAttemptResult,
        submittedUci: args.submittedUci,
        userRatingAfter,
        puzzleRatingAfter,
        thinkMs: args.thinkMs,
      },
    }),
    prisma.puzzleRating.update({
      where: { userId: args.userId },
      data: {
        rating: userRatingAfter,
        ratingDev: userRatingDevAfter,
        attempted: { increment: 1 },
        solved: { increment: args.result === 'CORRECT' ? 1 : 0 },
      },
    }),
    prisma.puzzle.update({
      where: { id: args.puzzleId },
      data: {
        rating: puzzleRatingAfter,
        ratingDev: puzzleRatingDevAfter,
        attempts: { increment: 1 },
        solved: { increment: args.result === 'CORRECT' ? 1 : 0 },
      },
    }),
  ]);

  return {
    result: args.result,
    solutionUci: puzzle.solutionUci,
    solutionSan: puzzle.solutionSan,
    userRating: userRatingAfter,
    puzzleRating: puzzleRatingAfter,
  };
}

export async function getUserPuzzleStats(userId: string) {
  return prisma.puzzleRating.findUnique({ where: { userId } });
}
