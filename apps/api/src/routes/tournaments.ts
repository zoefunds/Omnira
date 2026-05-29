import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createTournament, listTournaments, getTournament, joinTournament,
  withdrawFromTournament, listStandings, TournamentError,
} from '../tournaments/service.js';

const CreateBody = z.object({
  name: z.string().min(3).max(120),
  initialMs: z.number().int().min(15_000).max(3 * 60 * 60_000),
  incrementMs: z.number().int().min(0).max(60_000),
  rated: z.boolean().optional(),
  startsAt: z.string().datetime(),
  durationMs: z.number().int().min(5 * 60_000).max(6 * 60 * 60_000),
});

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export async function registerTournamentRoutes(app: FastifyInstance) {
  app.get('/tournaments', { config: { rateLimit: false } }, async (req) => {
    const q = (req.query as { status?: string }).status;
    const status = q === 'UPCOMING' || q === 'ACTIVE' || q === 'FINISHED' || q === 'CANCELLED' ? q : undefined;
    const list = await listTournaments({ status });
    return { tournaments: list };
  });

  app.get('/tournaments/:id', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    const t = await getTournament(id);
    if (!t) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { tournament: t };
  });

  app.get('/tournaments/:id/standings', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    const standings = await listStandings(id);
    return { standings };
  });

  app.get('/tournaments/:id/active-matches', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    const { prisma } = await import('@omnira/db');
    const matches = await prisma.match.findMany({
      where: { tournamentId: id, status: 'ACTIVE' },
      select: {
        id: true,
        whitePlayerId: true,
        blackPlayerId: true,
        finalFen: true,
        whitePlayer: { select: { id: true, username: true } },
        blackPlayer: { select: { id: true, username: true } },
        startedAt: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return { matches };
  });

  app.post('/tournaments', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    try {
      const t = await createTournament({
        creatorId: req.user.sub,
        name: parsed.data.name,
        initialMs: parsed.data.initialMs,
        incrementMs: parsed.data.incrementMs,
        rated: parsed.data.rated,
        startsAt: new Date(parsed.data.startsAt),
        durationMs: parsed.data.durationMs,
      });
      (app as any).io?.to('lobby:public').emit('tournament:created', { tournament: t });
      return reply.code(201).send({ tournament: t });
    } catch (e) {
      if (e instanceof TournamentError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/tournaments/:id/join', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    try {
      const p = await joinTournament(id, req.user.sub);
      (app as any).io?.to(`tournament:${id}`).emit('tournament:joined', { player: p });
      return reply.send({ player: p });
    } catch (e) {
      if (e instanceof TournamentError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/tournaments/:id/withdraw', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    await withdrawFromTournament(id, req.user.sub);
    (app as any).io?.to(`tournament:${id}`).emit('tournament:withdraw', { userId: req.user.sub });
    return { ok: true };
  });
}
