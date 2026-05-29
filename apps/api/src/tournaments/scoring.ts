import { prisma } from '@omnira/db';

const POINTS_WIN = 2;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

interface BumpInput {
  tournamentId: string;
  userId: string;
  result: 'WIN' | 'DRAW' | 'LOSS';
}

/** Apply a single game's result to a player's tournament row (Lichess-style streak). */
async function bumpPlayer(input: BumpInput) {
  const p = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId: input.tournamentId, userId: input.userId } },
  });
  if (!p) return; // user wasn't a participant

  let { score, wins, losses, draws, currentStreak, hasStreakBonus } = p;

  if (input.result === 'WIN') {
    const pointsForWin = hasStreakBonus ? POINTS_WIN * 2 : POINTS_WIN;
    score += pointsForWin;
    wins += 1;
    currentStreak += 1;
    hasStreakBonus = currentStreak >= 2; // next win is bonus
  } else if (input.result === 'DRAW') {
    score += POINTS_DRAW;
    draws += 1;
    currentStreak = 0;
    hasStreakBonus = false;
  } else {
    score += POINTS_LOSS;
    losses += 1;
    currentStreak = 0;
    hasStreakBonus = false;
  }

  await prisma.tournamentPlayer.update({
    where: { id: p.id },
    data: { score, wins, losses, draws, currentStreak, hasStreakBonus },
  });
}

/** Called from the match runtime's finalize() when Match.tournamentId is set. */
export async function applyMatchResultToTournament(args: {
  tournamentId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  outcome: 'WHITE_WON' | 'BLACK_WON' | 'DRAW';
}) {
  if (args.outcome === 'WHITE_WON') {
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.whitePlayerId, result: 'WIN' });
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.blackPlayerId, result: 'LOSS' });
  } else if (args.outcome === 'BLACK_WON') {
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.blackPlayerId, result: 'WIN' });
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.whitePlayerId, result: 'LOSS' });
  } else {
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.whitePlayerId, result: 'DRAW' });
    await bumpPlayer({ tournamentId: args.tournamentId, userId: args.blackPlayerId, result: 'DRAW' });
  }
}
