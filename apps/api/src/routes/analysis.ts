import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get('/match/:id/analysis', async (req, reply) => {
    const { id } = req.params as { id: string };
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
