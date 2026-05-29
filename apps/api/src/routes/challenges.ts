import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createChallenge,
  listOpenChallenges,
  getChallengeByCode,
  cancelChallenge,
  ChallengeError,
} from '../lobby/service.js';
import { ChallengeColor } from '@omnira/db';

const CreateBody = z.object({
  initialMs: z.number().int().min(15_000).max(3 * 60 * 60_000),
  incrementMs: z.number().int().min(0).max(60_000),
  colorPreference: z.nativeEnum(ChallengeColor).optional(),
  rated: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  minRating: z.number().int().nullable().optional(),
  maxRating: z.number().int().nullable().optional(),
});

export async function registerChallengeRoutes(app: FastifyInstance) {
  app.get('/challenges', async () => {
    const list = await listOpenChallenges();
    return { challenges: list };
  });

  app.get('/challenges/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const ch = await getChallengeByCode(code);
    if (!ch) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { challenge: ch };
  });

  app.post('/challenges', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    try {
      const ch = await createChallenge({ creatorId: req.user.sub, ...parsed.data });
      // Broadcast to lobby subscribers via Socket.IO
      (app as any).io?.to('lobby:public').emit('challenge:created', { challenge: ch });
      return reply.code(201).send({ challenge: ch });
    } catch (e) {
      if (e instanceof ChallengeError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/challenges/:code', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const { code } = req.params as { code: string };
    try {
      const ch = await cancelChallenge(code, req.user.sub);
      (app as any).io?.to('lobby:public').emit('challenge:cancelled', { code: ch.code });
      return { challenge: ch };
    } catch (e) {
      if (e instanceof ChallengeError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });
}
