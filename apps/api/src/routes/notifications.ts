import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../notifications/service.js';

const MarkReadBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  all: z.boolean().optional(),
});

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/me/notifications', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const userId = (req.user as { sub: string }).sub;
    const [items, unread] = await Promise.all([
      listNotifications(userId, 30),
      unreadCount(userId),
    ]);
    return reply.send({ items, unread });
  });

  app.post('/me/notifications/mark-read', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const userId = (req.user as { sub: string }).sub;
    const parsed = MarkReadBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    if (parsed.data.all) {
      const r = await markAllRead(userId);
      return reply.send({ ok: true, updated: r.count });
    }
    if (parsed.data.ids) {
      const r = await markRead(userId, parsed.data.ids);
      return reply.send({ ok: true, updated: r.count });
    }
    return reply.code(400).send({ error: 'NOTHING_TO_DO' });
  });
}
