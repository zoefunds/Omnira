import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { signup, login, getMe, AuthError } from '../auth/service.js';
import { env } from '../config/env.js';
import { isLocked, recordFailure, clearFailures } from '../auth/lockout.js';
import { createSession, findValidSession, revokeSession, revokeAllForUser, ACCESS_TTL_SEC } from '../auth/sessions.js';

const SignupBody = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(10).max(128),
});

const LoginBody = z.object({
  identifier: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
});

const RefreshBody = z.object({
  refreshToken: z.string().min(32),
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; sid?: string };
    user: { sub: string; sid?: string };
  }
}

function ipHashFromReq(req: { ip: string }): string {
  return createHash('sha256').update(req.ip).digest('hex').slice(0, 24);
}

const TIGHT_RL = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function registerAuthRoutes(app: FastifyInstance) {
  function handleError(err: unknown) {
    if (err instanceof AuthError) {
      return { status: err.status, body: { error: err.code, message: err.message } };
    }
    throw err;
  }

  app.post('/auth/signup', { config: TIGHT_RL }, async (req, reply) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    try {
      const user = await signup(parsed.data);
      const session = await createSession({
        userId: user.id,
        userAgent: req.headers['user-agent'] ?? null,
        ipHash: ipHashFromReq(req),
      });
      const accessToken = app.jwt.sign({ sub: user.id, sid: session.sessionId }, { expiresIn: ACCESS_TTL_SEC });
      return reply.code(201).send({
        user,
        token: accessToken,
        refreshToken: session.refreshToken,
        expiresIn: ACCESS_TTL_SEC,
      });
    } catch (e) {
      const r = handleError(e);
      return reply.code(r.status).send(r.body);
    }
  });

  app.post('/auth/login', { config: TIGHT_RL }, async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    const id = parsed.data.identifier;

    const locked = await isLocked(id);
    if (locked > 0) {
      return reply.code(429).send({
        error: 'LOCKED',
        message: `too many failures; try again in ${locked} seconds`,
        retryAfter: locked,
      });
    }

    try {
      const user = await login(parsed.data);
      await clearFailures(id);
      const session = await createSession({
        userId: user.id,
        userAgent: req.headers['user-agent'] ?? null,
        ipHash: ipHashFromReq(req),
      });
      const accessToken = app.jwt.sign({ sub: user.id, sid: session.sessionId }, { expiresIn: ACCESS_TTL_SEC });
      return reply.send({
        user,
        token: accessToken,
        refreshToken: session.refreshToken,
        expiresIn: ACCESS_TTL_SEC,
      });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'INVALID_CREDENTIALS') {
        const { locked: nowLocked, failsInWindow } = await recordFailure(id);
        if (nowLocked) {
          return reply.code(429).send({
            error: 'LOCKED',
            message: 'too many failures; account temporarily locked',
            retryAfter: 900,
          });
        }
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          failsInWindow,
        });
      }
      const r = handleError(e);
      return reply.code(r.status).send(r.body);
    }
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = RefreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const session = await findValidSession(parsed.data.refreshToken);
    if (!session) return reply.code(401).send({ error: 'INVALID_REFRESH' });
    const accessToken = app.jwt.sign({ sub: session.userId, sid: session.id }, { expiresIn: ACCESS_TTL_SEC });
    return reply.send({ token: accessToken, expiresIn: ACCESS_TTL_SEC });
  });

  app.post('/auth/logout', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const sid = (req.user as { sid?: string }).sid;
    if (sid) await revokeSession(sid).catch(() => {});
    return reply.send({ ok: true });
  });

  app.post('/auth/logout-all', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    await revokeAllForUser(req.user.sub).catch(() => {});
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
    const { sub } = req.user;
    try {
      const me = await getMe(sub);
      return reply.send({ user: me });
    } catch (e) {
      const r = handleError(e);
      return reply.code(r.status).send(r.body);
    }
  });
}
