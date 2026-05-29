import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { buildServer } from '../server.js';
import { prisma } from '@omnira/db';
import { redis, closeRedis } from '../lib/redis.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;
let baseUrl: string;

async function clearMatchmaking() {
  const r = redis();
  const keys = await r.keys('mm:*');
  if (keys.length) await r.del(...keys);
}

async function signupAndToken(tag: string) {
  const body = {
    email: `${tag}@omnira.test`,
    username: tag,
    password: 'correct horse battery staple',
  };
  const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body });
  return { userId: res.json().user.id as string, token: res.json().token as string, body };
}

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const sock = ioc(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    sock.once('connect', () => resolve(sock));
    sock.once('connect_error', reject);
  });
}

function once<T = any>(sock: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => sock.once(event, resolve));
}

function emit<T = any>(sock: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => sock.emit(event, payload, resolve));
}

beforeAll(async () => {
  app = await buildServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  port = addr.port;
  baseUrl = `http://127.0.0.1:${port}`;
  await clearMatchmaking();
}, 30_000);

afterAll(async () => {
  await app.close();
  await closeRedis();
  await prisma.$disconnect();
});

describe('realtime match flow', () => {
  it('matches two queued players, plays a few moves, resign ends the game', async () => {
    const tagA = 'rt_a_' + Math.random().toString(36).slice(2, 8);
    const tagB = 'rt_b_' + Math.random().toString(36).slice(2, 8);
    const a = await signupAndToken(tagA);
    const b = await signupAndToken(tagB);

    const sa = await connect(a.token);
    const sb = await connect(b.token);

    const startA = once<{ matchId: string; whitePlayerId: string; blackPlayerId: string }>(sa, 'match:start');
    const startB = once<{ matchId: string; whitePlayerId: string; blackPlayerId: string }>(sb, 'match:start');

    const tc = { initialMs: 300_000, incrementMs: 3_000 };
    const ackA = await emit(sa, 'queue:join', tc);
    expect(ackA.ok).toBe(true);
    const ackB = await emit(sb, 'queue:join', tc);
    expect(ackB.ok).toBe(true);

    const [eventA, eventB] = await Promise.all([startA, startB]);
    expect(eventA.matchId).toBe(eventB.matchId);
    const matchId = eventA.matchId;

    // Determine who is white
    const whiteSock = eventA.whitePlayerId === a.userId ? sa : sb;
    const blackSock = eventA.whitePlayerId === a.userId ? sb : sa;

    const moveB1 = once<{ san: string }>(blackSock, 'match:move');
    const ackMv1 = await emit(whiteSock, 'match:move', { matchId, uci: 'e2e4' });
    expect(ackMv1.ok).toBe(true);
    const m1 = await moveB1;
    expect(m1.san).toBe('e4');

    const moveW2 = once<{ san: string }>(whiteSock, 'match:move');
    const ackMv2 = await emit(blackSock, 'match:move', { matchId, uci: 'e7e5' });
    expect(ackMv2.ok).toBe(true);
    const m2 = await moveW2;
    expect(m2.san).toBe('e5');

    // Illegal move is rejected
    const bad = await emit(whiteSock, 'match:move', { matchId, uci: 'e2e5' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('ILLEGAL_MOVE');

    // White resigns
    const endB = once<{ outcome: string; reason: string }>(blackSock, 'match:end');
    const endA = once<{ outcome: string; reason: string }>(whiteSock, 'match:end');
    await emit(whiteSock, 'match:resign', { matchId });
    const [eA, eB] = await Promise.all([endA, endB]);
    expect(eA.outcome).toBe('BLACK_WON');
    expect(eA.reason).toBe('RESIGNATION');
    expect(eB.outcome).toBe('BLACK_WON');

    // DB has the moves and final status
    const persisted = await prisma.match.findUnique({
      where: { id: matchId },
      include: { moves: true },
    });
    expect(persisted?.status).toBe('BLACK_WON');
    expect(persisted?.resultReason).toBe('RESIGNATION');
    expect(persisted?.moves.length).toBe(2);

    sa.disconnect();
    sb.disconnect();
  }, 30_000);
});
