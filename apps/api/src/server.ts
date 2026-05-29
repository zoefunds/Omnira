import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';

export async function buildServer() {
  const cfg = env();
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, { secret: cfg.JWT_SECRET });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await registerAuthRoutes(app);

  return app;
}

// Only auto-start when run directly (not when imported by tests).
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
