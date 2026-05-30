import type { FastifyInstance } from 'fastify';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';

function adminAuthorized(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const token = (req.headers['x-admin-token'] ?? '') as string;
  const expected = (env() as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  return !!expected && token === expected;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin/flags', { config: { rateLimit: false } }, async (req, reply) => {
    if (!adminAuthorized(req as any)) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const status = ((req.query as { status?: string }).status ?? 'OPEN') as
      | 'OPEN' | 'REVIEWED_BENIGN' | 'REVIEWED_CHEATING';
    const flags = await prisma.suspicionFlag.findMany({
      where: { status },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: { select: { id: true, username: true } },
        match: { select: { id: true, status: true, category: true, endedAt: true } },
      },
    });
    return { flags };
  });

  app.post('/admin/flags/:id', { config: { rateLimit: false } }, async (req, reply) => {
    if (!adminAuthorized(req as any)) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };
    const body = req.body as { status?: 'REVIEWED_BENIGN' | 'REVIEWED_CHEATING'; note?: string };
    if (!body?.status) return reply.code(400).send({ error: 'INVALID_BODY' });
    const updated = await prisma.suspicionFlag.update({
      where: { id },
      data: { status: body.status, reviewerNote: body.note ?? null, reviewedAt: new Date() },
    });
    return { flag: updated };
  });

  app.get('/admin/flags/user/:username', { config: { rateLimit: false } }, async (req, reply) => {
    if (!adminAuthorized(req as any)) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { username } = req.params as { username: string };
    const u = await prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() } });
    if (!u) return reply.code(404).send({ error: 'NOT_FOUND' });
    const flags = await prisma.suspicionFlag.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      include: { match: { select: { id: true, status: true, category: true, endedAt: true } } },
    });
    return { user: { id: u.id, username: u.username }, flags };
  });
}
