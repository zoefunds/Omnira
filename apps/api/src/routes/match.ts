import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';
import { getRoom, snapshotRoom, listLiveRoomIds } from '../match/runtime.js';

/** In-process micro-cache for the spectator endpoints. With 150-300 viewers
 *  polling every 2 seconds we'd otherwise hit Postgres ~150 times/sec — caching
 *  for 1500 ms collapses that to under 1 query/sec. */
type Cached<T> = { at: number; value: T };
const CACHE_TTL_MS = 1500;
const cache = new Map<string, Cached<unknown>>();

function getCached<T>(key: string): T | undefined {
  const c = cache.get(key) as Cached<T> | undefined;
  if (!c) return undefined;
  if (Date.now() - c.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return c.value;
}
function setCached<T>(key: string, value: T) {
  cache.set(key, { at: Date.now(), value });
}

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
        data: { status: 'ABORTED', resultReason: 'ABANDONMENT', endedAt: new Date() },
      }).catch(() => {});
      return reply.send({ match: null });
    }
    return reply.send({ match: snapshotRoom(room) });
  });

  app.get('/matches/active', { config: { rateLimit: false } }, async (req, reply) => {
    const q = req.query as { page?: string; pageSize?: string; category?: string };
    const page = Math.max(1, Math.min(50, Number(q.page) || 1));
    const pageSize = Math.max(1, Math.min(60, Number(q.pageSize) || 24));
    const cat = q.category && /^(BULLET|BLITZ|RAPID|CLASSICAL)$/.test(q.category) ? q.category : 'all';

    const cacheKey = `active:${cat}:${page}:${pageSize}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      reply.header('x-cache', 'HIT');
      return cached;
    }

    const liveIds = listLiveRoomIds();
    if (liveIds.length === 0) {
      const empty = { matches: [], page, pageSize, total: 0, hasMore: false };
      setCached(cacheKey, empty);
      reply.header('x-cache', 'MISS');
      return empty;
    }
    const where = {
      status: 'ACTIVE' as const,
      id: { in: liveIds },
      ...(cat !== 'all'
        ? { category: cat as 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL' }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.match.count({ where }),
      prisma.match.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
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
    const payload = {
      matches,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
    setCached(cacheKey, payload);
    reply.header('x-cache', 'MISS');
    return payload;
  });

  // Single round-trip for the spectator filter chips. Replaces five separate
  // /matches/active?pageSize=1&category=... pings.
  app.get('/matches/summary', { config: { rateLimit: false } }, async (_req, reply) => {
    const cacheKey = 'summary';
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      reply.header('x-cache', 'HIT');
      return cached;
    }
    const liveIds = listLiveRoomIds();
    if (liveIds.length === 0) {
      const empty = { all: 0, BULLET: 0, BLITZ: 0, RAPID: 0, CLASSICAL: 0 };
      setCached(cacheKey, empty);
      reply.header('x-cache', 'MISS');
      return empty;
    }
    const rows = await prisma.match.groupBy({
      by: ['category'],
      where: { status: 'ACTIVE', id: { in: liveIds } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      all: 0,
      BULLET: 0,
      BLITZ: 0,
      RAPID: 0,
      CLASSICAL: 0,
    };
    for (const r of rows) {
      counts[r.category] = r._count._all;
      counts.all += r._count._all;
    }
    setCached(cacheKey, counts);
    reply.header('x-cache', 'MISS');
    return counts;
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
