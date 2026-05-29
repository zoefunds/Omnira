import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signup, login, getMe, AuthError } from '../auth/service.js';
import { env } from '../config/env.js';

const SignupBody = z.object({
  email: z.string().email().max(254),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'username may contain letters, numbers, underscore only'),
  password: z.string().min(10).max(128),
});

const LoginBody = z.object({
  identifier: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const cfg = env();

  function handleError(err: unknown) {
    if (err instanceof AuthError) {
      return { status: err.status, body: { error: err.code, message: err.message } };
    }
    throw err;
  }

  app.post('/auth/signup', async (req, reply) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    try {
      const user = await signup(parsed.data);
      const token = app.jwt.sign({ sub: user.id }, { expiresIn: cfg.JWT_TTL });
      return reply.code(201).send({ user, token });
    } catch (e) {
      const r = handleError(e);
      return reply.code(r.status).send(r.body);
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
    }
    try {
      const user = await login(parsed.data);
      const token = app.jwt.sign({ sub: user.id }, { expiresIn: cfg.JWT_TTL });
      return reply.send({ user, token });
    } catch (e) {
      const r = handleError(e);
      return reply.code(r.status).send(r.body);
    }
  });

  app.get('/auth/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
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
