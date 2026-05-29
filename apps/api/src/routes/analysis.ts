import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get('/match/:id/analysis', { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      return reply.code(400).send({ error: 'BAD_ID' });
    }
    const r = await prisma.analysisReport.findUnique({
      where: { matchId: id },
      select: {
        matchId: true,
        engineReport: true,
        llmSummary: true,
        llmReport: true,
        alternatives: true,
        generatedAt: true,
      },
    });
    if (!r) return reply.code(404).send({ error: 'PENDING' });
    return reply.send(r);
  });
}
