import type { FastifyInstance } from 'fastify';
import { listMessages, assertParticipant, ChatError } from '../chat/service.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.get('/match/:id/chat', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const { id } = req.params as { id: string };
    try {
      await assertParticipant(id, req.user.sub);
      const messages = await listMessages(id);
      return { messages };
    } catch (e) {
      if (e instanceof ChatError) return reply.code(e.status).send({ error: e.code });
      throw e;
    }
  });
}
