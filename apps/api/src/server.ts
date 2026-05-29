import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMatchRoutes } from './routes/match.js';
import { registerChallengeRoutes } from './routes/challenges.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerAlternativeRoutes } from './routes/alternatives.js';
import { registerTournamentRoutes } from './routes/tournaments.js';
import { attachRealtime } from './realtime/socket.js';

export async function buildServer() {
  const cfg = env();
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(jwt, { secret: cfg.JWT_SECRET });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await registerAuthRoutes(app);
  await registerMatchRoutes(app);
  await registerChallengeRoutes(app);
  await registerChatRoutes(app);
  await registerAnalysisRoutes(app);
  await registerAlternativeRoutes(app);
  await registerTournamentRoutes(app);

  // Force fastify to instantiate the underlying http server before we attach socket.io
  await app.ready();
  const io = attachRealtime(app);

  // Expose for shutdown
  (app as unknown as { io: typeof io }).io = io;

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cfg = env();
  buildServer()
    .then((app) =>
      app.listen({ port: cfg.API_PORT, host: '0.0.0.0' }).then(() => {
        app.log.info(`omnira-api listening on :${cfg.API_PORT}`);
      }),
    )
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
