import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@omnira/db';

const CreateBody = z.object({
  ply: z.number().int().min(1).max(800),
  alternativeUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
});

export async function registerAlternativeRoutes(app: FastifyInstance) {
  app.get('/match/:id/alternatives', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return reply.code(400).send({ error: 'BAD_ID' });
    const list = await prisma.alternative.findMany({
      where: { matchId: id },
      orderBy: [{ ply: 'asc' }, { createdAt: 'asc' }],
    });
    return { alternatives: list };
  });

  app.post('/match/:id/alternatives', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const { id } = req.params as { id: string };
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return reply.code(400).send({ error: 'BAD_ID' });

    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }

    // Only players of this match may request alternatives (cheap auth — spectator alts can come later)
    const m = await prisma.match.findUnique({
      where: { id },
      select: { whitePlayerId: true, blackPlayerId: true, status: true },
    });
    if (!m) return reply.code(404).send({ error: 'NO_MATCH' });
    if (m.whitePlayerId !== req.user.sub && m.blackPlayerId !== req.user.sub) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    if (m.status === 'PENDING' || m.status === 'ACTIVE') {
      return reply.code(409).send({ error: 'GAME_NOT_OVER' });
    }

    try {
      const alt = await prisma.alternative.create({
        data: {
          matchId: id,
          ply: parsed.data.ply,
          alternativeUci: parsed.data.alternativeUci,
          alternativeSan: '',  // filled in by worker
          fenBefore: '',       // filled in by worker
          playedSan: '',       // filled in by worker
        },
      });
      return reply.code(202).send({ alternative: alt });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Already requested this exact alternative — return the existing row.
        const existing = await prisma.alternative.findFirst({
          where: { matchId: id, ply: parsed.data.ply, alternativeUci: parsed.data.alternativeUci },
        });
        return reply.send({ alternative: existing });
      }
      throw e;
    }
  });
}
