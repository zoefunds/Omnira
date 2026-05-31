import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMatchRoutes } from './routes/match.js';
import { registerChallengeRoutes } from './routes/challenges.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerAlternativeRoutes } from './routes/alternatives.js';
import { registerTournamentRoutes } from './routes/tournaments.js';
import { registerUserRoutes } from './routes/users.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerPuzzleRoutes } from './routes/puzzles.js';
import { registerWalletRoutes } from './routes/wallet.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { attachRealtime } from './realtime/socket.js';
import { spawnMatch } from './match/runtime.js';
import { startTournamentRuntime } from './tournaments/runtime.js';

export async function buildServer() {
  const cfg = env();
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(jwt, { secret: cfg.JWT_SECRET });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  // Readiness — verifies downstream deps (DB + Redis). Used by orchestrators.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    const checks: Record<string, { ok: boolean; ms?: number; err?: string }> = {};
    let allOk = true;

    // Postgres
    const t0 = Date.now();
    try {
      const { prisma } = await import('@omnira/db');
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      allOk = false;
      checks.postgres = { ok: false, err: (e as Error).message };
    }

    // Redis
    const t1 = Date.now();
    try {
      const { redis } = await import('./lib/redis.js');
      const pong = await redis().ping();
      if (pong !== 'PONG') throw new Error('unexpected ping reply: ' + pong);
      checks.redis = { ok: true, ms: Date.now() - t1 };
    } catch (e) {
      allOk = false;
      checks.redis = { ok: false, err: (e as Error).message };
    }

    return reply.code(allOk ? 200 : 503).send({ ok: allOk, checks, ts: Date.now() });
  });

  await registerAuthRoutes(app);
  await registerMatchRoutes(app);
  await registerChallengeRoutes(app);
  await registerChatRoutes(app);
  await registerAnalysisRoutes(app);
  await registerAlternativeRoutes(app);
  await registerTournamentRoutes(app);
  await registerUserRoutes(app);
  await registerPuzzleRoutes(app);
  await registerAdminRoutes(app);
  await registerWalletRoutes(app);
  await registerNotificationRoutes(app);

  // Force fastify to instantiate the underlying http server before we attach socket.io
  await app.ready();
  const io = attachRealtime(app);
  startTournamentRuntime(io, async (args) => spawnMatch(args));

  // Expose for shutdown
  (app as unknown as { io: typeof io }).io = io;

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cfg = env();
  buildServer()
    .then(async (app) => {
      // Mark abandoned matches from previous container life as ABORTED so they
      // disappear from /matches/active and /me/current-match.
      try {
        const { prisma } = await import('@omnira/db');
        const r = await prisma.match.updateMany({
          where: { status: 'ACTIVE' },
          data: { status: 'ABORTED', resultReason: 'ABANDONED', endedAt: new Date() },
        });
        if (r.count > 0) app.log.info({ count: r.count }, 'aborted orphan matches on boot');
      } catch (e) {
        app.log.warn({ err: (e as Error).message }, 'orphan match cleanup failed');
      }

      return app.listen({ port: cfg.API_PORT, host: '0.0.0.0' }).then(() => {
        app.log.info(`omnira-api listening on :${cfg.API_PORT}`);
      });
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
