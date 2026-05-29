import { prisma, TournamentStatus, TournamentFormat, Prisma } from '@omnira/db';
import { classify } from '@omnira/chess-engine';

export class TournamentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const MIN_DURATION_MS = 5 * 60_000;       // 5 min
const MAX_DURATION_MS = 6 * 60 * 60_000;  // 6 h
const MIN_LEAD_MS = 30_000;               // at least 30s before kickoff
const MAX_LEAD_MS = 30 * 24 * 60 * 60_000; // 30 days

export interface CreateTournamentInput {
  creatorId: string;
  name: string;
  initialMs: number;
  incrementMs: number;
  rated?: boolean;
  startsAt: Date;
  durationMs: number;
}

export async function createTournament(input: CreateTournamentInput) {
  const now = Date.now();
  if (input.name.trim().length < 3) throw new TournamentError('BAD_NAME', 'name must be ≥ 3 chars');
  if (input.initialMs < 15_000 || input.initialMs > 3 * 60 * 60_000)
    throw new TournamentError('BAD_TIME', 'initial time out of range');
  if (input.incrementMs < 0 || input.incrementMs > 60_000)
    throw new TournamentError('BAD_TIME', 'increment out of range');
  const leadMs = input.startsAt.getTime() - now;
  if (leadMs < MIN_LEAD_MS) throw new TournamentError('TOO_SOON', 'startsAt is too soon');
  if (leadMs > MAX_LEAD_MS) throw new TournamentError('TOO_FAR', 'startsAt is too far in the future');
  if (input.durationMs < MIN_DURATION_MS || input.durationMs > MAX_DURATION_MS)
    throw new TournamentError('BAD_DURATION', 'duration out of range');

  const category = classify(input.initialMs, input.incrementMs);
  const endsAt = new Date(input.startsAt.getTime() + input.durationMs);

  return prisma.tournament.create({
    data: {
      name: input.name.trim(),
      format: TournamentFormat.ARENA,
      createdById: input.creatorId,
      category,
      initialMs: input.initialMs,
      incrementMs: input.incrementMs,
      rated: input.rated ?? true,
      startsAt: input.startsAt,
      durationMs: input.durationMs,
      endsAt,
      status: TournamentStatus.UPCOMING,
    },
    include: {
      createdBy: { select: { id: true, username: true } },
      _count: { select: { players: true } },
    },
  });
}

export async function listTournaments(opts: { status?: TournamentStatus } = {}) {
  const where: Prisma.TournamentWhereInput = {};
  if (opts.status) where.status = opts.status;
  return prisma.tournament.findMany({
    where,
    orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
    take: 200,
    include: {
      createdBy: { select: { id: true, username: true } },
      _count: { select: { players: true } },
    },
  });
}

export async function getTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, username: true } },
      _count: { select: { players: true } },
    },
  });
}

export async function joinTournament(tournamentId: string, userId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, startsAt: true, endsAt: true },
  });
  if (!t) throw new TournamentError('NOT_FOUND', 'no such tournament', 404);
  if (t.status === 'CANCELLED' || t.status === 'FINISHED')
    throw new TournamentError('BAD_STATE', `tournament is ${t.status.toLowerCase()}`);
  // For arena you can join while UPCOMING and also during ACTIVE (late join).
  if (t.endsAt.getTime() < Date.now())
    throw new TournamentError('ENDED', 'tournament has ended');

  // Snapshot user's rating for the relevant category.
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId }, select: { category: true },
  });
  const rating = await prisma.rating.findUnique({
    where: { userId_category: { userId, category: tournament!.category } },
    select: { rating: true },
  });

  try {
    return await prisma.tournamentPlayer.create({
      data: {
        tournamentId,
        userId,
        ratingAtStart: rating?.rating ?? null,
      },
      include: { user: { select: { id: true, username: true } } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new TournamentError('ALREADY_JOINED', 'already a participant', 409);
    }
    throw e;
  }
}

export async function withdrawFromTournament(tournamentId: string, userId: string) {
  return prisma.tournamentPlayer.updateMany({
    where: { tournamentId, userId },
    data: { withdrew: true },
  });
}

export async function listStandings(tournamentId: string, limit = 100) {
  return prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    orderBy: [{ score: 'desc' }, { wins: 'desc' }, { joinedAt: 'asc' }],
    take: limit,
    include: { user: { select: { id: true, username: true } } },
  });
}

/** Sync helper for the runtime tick (Phase 11B). UPCOMING→ACTIVE→FINISHED transitions. */
export async function tickTournamentStatuses(now = Date.now()): Promise<{ activated: string[]; finished: string[] }> {
  const activated: string[] = [];
  const finished: string[] = [];

  const dueToStart = await prisma.tournament.findMany({
    where: { status: 'UPCOMING', startsAt: { lte: new Date(now) } },
    select: { id: true },
  });
  for (const t of dueToStart) {
    await prisma.tournament.update({ where: { id: t.id }, data: { status: 'ACTIVE' } });
    activated.push(t.id);
  }

  const dueToEnd = await prisma.tournament.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: new Date(now) } },
    select: { id: true },
  });
  for (const t of dueToEnd) {
    // Compute winner from current standings.
    const top = await prisma.tournamentPlayer.findFirst({
      where: { tournamentId: t.id },
      orderBy: [{ score: 'desc' }, { wins: 'desc' }],
      select: { userId: true },
    });
    await prisma.tournament.update({
      where: { id: t.id },
      data: { status: 'FINISHED', winnerId: top?.userId ?? null },
    });
    finished.push(t.id);
  }
  return { activated, finished };
}
