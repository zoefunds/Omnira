import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { signup, login, getMe, AuthError, deleteAccount } from '../auth/service.js';
import { verifyPassword } from '../auth/password.js';
import { prisma } from '@omnira/db';
import { env } from '../config/env.js';
import { isLocked, recordFailure, clearFailures } from '../auth/lockout.js';
import { createSession, findValidSession, revokeSession, revokeAllForUser, ACCESS_TTL_SEC } from '../auth/sessions.js';
import { startPasswordReset, completePasswordReset, ResetError } from '../auth/passwordReset.js';
import {
  startEmailVerification,
  completeEmailVerification,
  VerifyError,
} from '../auth/emailVerification.js';
import { notify } from '../notifications/service.js';

const ForgotBody = z.object({
  email: z.string().email().max(254),
});

const DeleteAccountBody = z.object({
  password: z.string().min(1).max(128),
  /** User must type their username to confirm the destructive action. */
  confirmUsername: z.string().min(1).max(50),
});

const VerifyEmailBody = z.object({
  token: z.string().min(32).max(256),
});

const ResetBody = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(10).max(128),
});

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
      // Fire-and-forget: send the verification email + queue a welcome
      // notification. Failures should not block signup.
      void startEmailVerification(user.id).catch((err) => {
        app.log.error({ err, userId: user.id }, 'failed to start email verification');
      });
      void notify({
        userId: user.id,
        kind: 'WELCOME',
        title: 'Welcome to Omnira',
        body: 'Your GenLayer wallet is ready. Verify your email to secure your account.',
        href: '/settings',
      }).catch((err) => {
        app.log.warn({ err, userId: user.id }, 'failed to create welcome notification');
      });
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

  // Forgot password — always responds 200 with a neutral message to avoid
  // leaking which emails are registered. Heavily rate-limited per IP.
  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const parsed = ForgotBody.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }
      try {
        await startPasswordReset({
          email: parsed.data.email,
          ipHash: ipHashFromReq(req),
        });
      } catch (e) {
        // Log but still respond 200 to avoid enumeration.
        app.log.error({ err: e }, 'forgot-password start failed');
      }
      return reply.send({
        ok: true,
        message:
          'If an account exists for that email, a reset link has been sent.',
      });
    },
  );

  app.post(
    '/auth/reset-password',
    { config: TIGHT_RL },
    async (req, reply) => {
      const parsed = ResetBody.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }
      try {
        await completePasswordReset(parsed.data);
        return reply.send({ ok: true });
      } catch (e) {
        if (e instanceof ResetError) {
          return reply.code(e.status).send({ error: e.code, message: e.message });
        }
        app.log.error({ err: e }, 'reset-password failed');
        return reply.code(500).send({ error: 'INTERNAL' });
      }
    },
  );

  // Permanently soft-delete the signed-in user's account. Requires password
  // re-confirmation and exact username match to prevent accidental destruction.
  app.delete(
    '/me',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
      const parsed = DeleteAccountBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }
      const userId = (req.user as { sub: string }).sub;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, passwordHash: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.code(404).send({ error: 'NOT_FOUND' });
      if (parsed.data.confirmUsername.trim() !== user.username) {
        return reply.code(400).send({ error: 'USERNAME_MISMATCH' });
      }
      const ok = await verifyPassword(user.passwordHash, parsed.data.password);
      if (!ok) return reply.code(401).send({ error: 'INVALID_PASSWORD' });
      try {
        await deleteAccount(userId);
      } catch (e) {
        app.log.error({ err: e, userId }, 'delete account failed');
        return reply.code(500).send({ error: 'INTERNAL' });
      }
      app.log.info({ userId }, 'account deleted (soft)');
      return reply.send({ ok: true });
    },
  );

  // Email verification — public endpoint that consumes a token from the email.
  app.post(
    '/auth/verify-email',
    { config: TIGHT_RL },
    async (req, reply) => {
      const parsed = VerifyEmailBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }
      try {
        await completeEmailVerification(parsed.data.token);
        return reply.send({ ok: true });
      } catch (e) {
        if (e instanceof VerifyError) {
          return reply.code(e.status).send({ error: e.code, message: e.message });
        }
        app.log.error({ err: e }, 'verify-email failed');
        return reply.code(500).send({ error: 'INTERNAL' });
      }
    },
  );

  // Re-send the verification email (authed).
  app.post(
    '/me/resend-verification',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
      const userId = (req.user as { sub: string }).sub;
      try {
        await startEmailVerification(userId);
      } catch (e) {
        app.log.error({ err: e, userId }, 'resend verification failed');
      }
      return reply.send({ ok: true });
    },
  );

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
