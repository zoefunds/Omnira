import { prisma, Prisma, ChallengeStatus, ChallengeColor, TimeControlCategory } from '@omnira/db';
import { classify } from '@omnira/chess-engine';
import { newChallengeCode } from './codes.js';

export class ChallengeError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export interface CreateChallengeInput {
  creatorId: string;
  initialMs: number;
  incrementMs: number;
  colorPreference?: ChallengeColor;
  rated?: boolean;
  isPublic?: boolean;
  minRating?: number | null;
  maxRating?: number | null;
}

export async function createChallenge(input: CreateChallengeInput) {
  if (input.initialMs < 15_000 || input.initialMs > 3 * 60 * 60_000) {
    throw new ChallengeError('BAD_TIME_CONTROL', 'initial time out of range');
  }
  if (input.incrementMs < 0 || input.incrementMs > 60_000) {
    throw new ChallengeError('BAD_TIME_CONTROL', 'increment out of range');
  }
  const category: TimeControlCategory = classify(input.initialMs, input.incrementMs);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newChallengeCode();
    try {
      const ch = await prisma.challenge.create({
        data: {
          code,
          creatorId: input.creatorId,
          category,
          initialMs: input.initialMs,
          incrementMs: input.incrementMs,
          colorPreference: input.colorPreference ?? 'RANDOM',
          rated: input.rated ?? true,
          isPublic: input.isPublic ?? true,
          minRating: input.minRating ?? null,
          maxRating: input.maxRating ?? null,
          expiresAt: new Date(Date.now() + DEFAULT_TTL_MS),
        },
        include: { creator: { select: { id: true, username: true } } },
      });
      return ch;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        continue; // code collision, try again
      }
      throw e;
    }
  }
  throw new ChallengeError('CODE_COLLISION', 'failed to allocate a unique code', 500);
}

export async function listOpenChallenges() {
  await expireOverdue();
  return prisma.challenge.findMany({
    where: { status: 'OPEN', isPublic: true, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { creator: { select: { id: true, username: true } } },
  });
}

export async function getChallengeByCode(code: string) {
  return prisma.challenge.findUnique({
    where: { code },
    include: { creator: { select: { id: true, username: true } } },
  });
}

export async function cancelChallenge(code: string, userId: string) {
  const ch = await prisma.challenge.findUnique({ where: { code } });
  if (!ch) throw new ChallengeError('NOT_FOUND', 'no such challenge', 404);
  if (ch.creatorId !== userId) throw new ChallengeError('FORBIDDEN', 'not your challenge', 403);
  if (ch.status !== 'OPEN') throw new ChallengeError('BAD_STATE', `not OPEN: ${ch.status}`);
  return prisma.challenge.update({
    where: { id: ch.id },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Accept and atomically reserve. Returns the challenge with status flipped to ACCEPTED.
 * The caller (socket handler) is responsible for then spinning up the match runtime room
 * and writing back the matchId via `linkMatch`.
 */
export async function acceptChallenge(code: string, accepterId: string) {
  const ch = await prisma.challenge.findUnique({ where: { code } });
  if (!ch) throw new ChallengeError('NOT_FOUND', 'no such challenge', 404);
  if (ch.creatorId === accepterId) throw new ChallengeError('SELF_ACCEPT', 'cannot accept your own challenge');
  if (ch.status !== 'OPEN') throw new ChallengeError('BAD_STATE', `not OPEN: ${ch.status}`);
  if (ch.expiresAt.getTime() < Date.now()) throw new ChallengeError('EXPIRED', 'challenge expired');

  // Atomically claim — only succeed if status is still OPEN.
  const claimed = await prisma.challenge.updateMany({
    where: { id: ch.id, status: 'OPEN' },
    data: { status: 'ACCEPTED', acceptedById: accepterId },
  });
  if (claimed.count !== 1) throw new ChallengeError('RACE', 'challenge already accepted', 409);

  return prisma.challenge.findUniqueOrThrow({
    where: { id: ch.id },
    include: { creator: { select: { id: true, username: true } } },
  });
}

export async function linkMatch(challengeId: string, matchId: string) {
  return prisma.challenge.update({
    where: { id: challengeId },
    data: { matchId },
  });
}

async function expireOverdue() {
  await prisma.challenge.updateMany({
    where: { status: 'OPEN', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

/** Pick white/black from creator and accepter based on the challenge's preference. */
export function resolveColors(
  creatorId: string,
  accepterId: string,
  preference: ChallengeColor,
): { whitePlayerId: string; blackPlayerId: string } {
  let creatorIsWhite: boolean;
  if (preference === 'WHITE') creatorIsWhite = true;
  else if (preference === 'BLACK') creatorIsWhite = false;
  else creatorIsWhite = Math.random() < 0.5;

  return creatorIsWhite
    ? { whitePlayerId: creatorId, blackPlayerId: accepterId }
    : { whitePlayerId: accepterId, blackPlayerId: creatorId };
}
