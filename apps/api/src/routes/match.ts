import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';
import { getRoom, snapshotRoom, listLiveRoomIds } from '../match/runtime.js';

export async function registerMatchRoutes(app: FastifyInstance) {

  // Current active match for the signed-in user — used for rejoin after refresh.
  app.get('/me/current-match', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const userId = (req.user as { sub: string }).sub;

    // Look up the user's most recent ACTIVE match in the DB.
    const m = await prisma.match.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!m) return reply.send({ match: null });

    // If the in-memory room still exists, return a live snapshot.
    const room = getRoom(m.id);
    if (!room || room.ended) {
      // Server lost the room (restart, abandon). Mark abandoned so it stops
      // appearing in Watch and the user gets a clean lobby state.
      await prisma.match.update({
        where: { id: m.id },
        data: { status: 'ABORTED', resultReason: 'ABANDONED', endedAt: new Date() },
      }).catch(() => {});
      return reply.send({ match: null });
    }
    return reply.send({ match: snapshotRoom(room) });
  });

  app.get('/matches/active', { config: { rateLimit: false } }, async (req, reply) => {
    void req; void reply;
    const liveIds = new Set(listLiveRoomIds());
    if (liveIds.size === 0) return { matches: [] };
    const rows = await prisma.match.findMany({
      where: { status: 'ACTIVE', id: { in: Array.from(liveIds) } },
      select: {
        id: true,
        whitePlayerId: true,
        blackPlayerId: true,
        whitePlayer: { select: { id: true, username: true } },
        blackPlayer: { select: { id: true, username: true } },
        category: true,
        initialTimeSec: true,
        incrementSec: true,
        tournamentId: true,
        startedAt: true,
        moves: { orderBy: { ply: 'desc' }, take: 1, select: { fenAfter: true, ply: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 60,
    });
    const matches = rows.map((m) => ({
      id: m.id,
      whitePlayer: m.whitePlayer,
      blackPlayer: m.blackPlayer,
      category: m.category,
      initialTimeSec: m.initialTimeSec,
      incrementSec: m.incrementSec,
      tournamentId: m.tournamentId,
      startedAt: m.startedAt,
      currentFen: m.moves[0]?.fenAfter ?? null,
      ply: m.moves[0]?.ply ?? 0,
    }));
    return { matches };
  });

  app.get('/match/:id', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    const m = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        resultReason: true,
        category: true,
        initialTimeSec: true,
        incrementSec: true,
        whitePlayer: { select: { id: true, username: true } },
        blackPlayer: { select: { id: true, username: true } },
        whiteRatingBefore: true, blackRatingBefore: true,
        whiteRatingAfter: true,  blackRatingAfter: true,
        finalFen: true, pgn: true,
        startedAt: true, endedAt: true,
        tournamentId: true,
        onchainMatchId: true, onchainTxHash: true, onchainSettledAt: true,
        moves: {
          orderBy: { ply: 'asc' },
          select: { ply: true, san: true, uci: true, fenAfter: true, clockMsWhite: true, clockMsBlack: true },
        },
      },
    });
    if (!m) return reply.code(404).send({ error: 'NOT_FOUND' });
    const currentFen = m.moves.length > 0 ? m.moves[m.moves.length - 1]!.fenAfter : null;
    return { match: { ...m, currentFen } };
  });

  app.get('/match/:id/onchain', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        onchainMatchId: true,
        onchainTxHash: true,
        onchainSettledAt: true,
      },
    });
    if (!m) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.send({
      ...m,
      registryAddress: env().GENLAYER_MATCH_REGISTRY_ADDRESS ?? null,
    });
  });
}
