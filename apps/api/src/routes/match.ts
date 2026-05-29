import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';

export async function registerMatchRoutes(app: FastifyInstance) {

  app.get('/matches/active', { config: { rateLimit: false } }, async (req, reply) => {
    const { prisma } = await import('@omnira/db');
    const rows = await prisma.match.findMany({
      where: { status: 'ACTIVE' },
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
    const { prisma } = await import('@omnira/db');
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
