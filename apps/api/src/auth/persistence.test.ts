import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@omnira/db';
import { buildServer } from '../server.js';
import { deriveAddress } from '../wallet/derive.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function uniqueSignup() {
  const tag = Math.random().toString(36).slice(2, 10);
  const body = {
    email: `u_${tag}@omnira.test`,
    username: `u_${tag}`,
    password: 'correct horse battery staple',
  };
  const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body });
  return { res, body };
}

describe('auth + wallet persistence', () => {
  it('signup creates user + deterministic wallet', async () => {
    const { res } = await uniqueSignup();
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.user.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(json.token).toBeTypeOf('string');
  });

  it('rejects duplicate email', async () => {
    const { res, body } = await uniqueSignup();
    expect(res.statusCode).toBe(201);
    const dup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...body, username: body.username + '2' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('EMAIL_TAKEN');
  });

  it('login with email works; login with username works', async () => {
    const { body } = await uniqueSignup();

    const byEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: body.email, password: body.password },
    });
    expect(byEmail.statusCode).toBe(200);

    const byUsername = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: body.username, password: body.password },
    });
    expect(byUsername.statusCode).toBe(200);

    expect(byEmail.json().user.walletAddress).toBe(byUsername.json().user.walletAddress);
  });

  it('rejects wrong password', async () => {
    const { body } = await uniqueSignup();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: body.email, password: 'nope nope nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('WALLET SURVIVES DATA LOSS — delete Wallet row, re-derive, same address', async () => {
    const { res } = await uniqueSignup();
    const userId = res.json().user.id as string;
    const originalAddress = res.json().user.walletAddress as string;

    // Simulate catastrophic loss: drop the wallet row entirely.
    await prisma.wallet.delete({ where: { userId } });
    const gone = await prisma.wallet.findUnique({ where: { userId } });
    expect(gone).toBeNull();

    // Re-derive purely from the userId (the only persistent input).
    const rederived = await deriveAddress(userId);
    expect(rederived).toBe(originalAddress);
  });

  it('/auth/me returns the same wallet across logins', async () => {
    const { body } = await uniqueSignup();
    const login1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: body.email, password: body.password },
    });
    const token1 = login1.json().token as string;
    const me1 = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(me1.statusCode).toBe(200);

    // Second login = different device / cleared cache scenario.
    const login2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: body.email, password: body.password },
    });
    const token2 = login2.json().token as string;
    const me2 = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(me2.statusCode).toBe(200);

    expect(me1.json().user.walletAddress).toBe(me2.json().user.walletAddress);
  });
});
