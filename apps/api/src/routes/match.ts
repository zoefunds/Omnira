import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';

export async function registerMatchRoutes(app: FastifyInstance) {
  app.get('/match/:id/onchain', async (req, reply) => {
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
