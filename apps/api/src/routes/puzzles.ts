import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pickNextForUser, submitAttempt, getUserPuzzleStats, PuzzleError } from '../puzzles/service.js';
import { prisma } from '@omnira/db';

const SubmitBody = z.object({
  puzzleId: z.string().uuid(),
  submittedUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/).optional(),
  result: z.enum(['CORRECT', 'WRONG', 'SKIPPED']),
  thinkMs: z.number().int().min(0).max(60 * 60_000).default(0),
});

export async function registerPuzzleRoutes(app: FastifyInstance) {
  app.get('/puzzles/next', { config: { rateLimit: false } }, async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const next = await pickNextForUser(req.user.sub);
    if (!next) return reply.code(204).send();
    return { puzzle: next };
  });

  app.post('/puzzles/attempt', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const parsed = SubmitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    try {
      const r = await submitAttempt({
        puzzleId: parsed.data.puzzleId,
        userId: req.user.sub,
        submittedUci: parsed.data.submittedUci ?? null,
        result: parsed.data.result,
        thinkMs: parsed.data.thinkMs,
      });
      return r;
    } catch (e) {
      if (e instanceof PuzzleError) return reply.code(e.status).send({ error: e.code });
      throw e;
    }
  });

  app.get('/puzzles/stats/:username', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    const u = await prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() } });
    if (!u) return reply.code(404).send({ error: 'NOT_FOUND' });
    const stats = await getUserPuzzleStats(u.id);
    return { stats };
  });
}
