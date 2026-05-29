import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { joinOrMatch, leaveQueue } from '../matchmaking/queue.js';
import { spawnMatch, getRoom, playMove, resign, offerDraw, acceptDraw } from '../match/runtime.js';
import { prisma } from '@omnira/db';

interface AuthedSocket extends Socket {
  data: { userId: string };
}

export function attachRealtime(app: FastifyInstance): Server {
  const io = new Server(app.server, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  // Authenticate every socket via JWT in the handshake.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ??
        (socket.handshake.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('NO_TOKEN'));
      const payload = app.jwt.verify<{ sub: string }>(token);
      (socket as AuthedSocket).data.userId = payload.sub;
      next();
    } catch {
      next(new Error('BAD_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const s = socket as AuthedSocket;
    const userId = s.data.userId;
    s.join(`user:${userId}`);

    s.on('queue:join', async (payload: { initialMs: number; incrementMs: number }, ack) => {
      try {
        const ratings = await prisma.rating.findMany({ where: { userId } });
        // Use the rating that matches the bucket's category. For simplicity, average for now.
        const rating = ratings.length
          ? Math.round(ratings.reduce((a, r) => a + r.rating, 0) / ratings.length)
          : 1500;

        const opp = await joinOrMatch({
          userId,
          rating,
          initialMs: payload.initialMs,
          incrementMs: payload.incrementMs,
          joinedAt: Date.now(),
        });

        if (!opp) {
          ack?.({ ok: true, status: 'waiting' });
          return;
        }

        // Randomize colors
        const whiteFirst = Math.random() < 0.5;
        const whitePlayerId = whiteFirst ? userId : opp.userId;
        const blackPlayerId = whiteFirst ? opp.userId : userId;

        const room = await spawnMatch({
          whitePlayerId,
          blackPlayerId,
          initialMs: payload.initialMs,
          incrementMs: payload.incrementMs,
        });

        const start = {
          matchId: room.id,
          whitePlayerId,
          blackPlayerId,
          initialMs: payload.initialMs,
          incrementMs: payload.incrementMs,
          fen: room.game.fen(),
          startedAt: Date.now(),
        };

        io.to(`user:${whitePlayerId}`).to(`user:${blackPlayerId}`).emit('match:start', start);

        // Each player auto-joins the match room
        const sockets = await io.fetchSockets();
        for (const sock of sockets) {
          const uid = (sock.data as { userId?: string }).userId;
          if (uid === whitePlayerId || uid === blackPlayerId) {
            sock.join(`match:${room.id}`);
          }
        }

        ack?.({ ok: true, status: 'matched', matchId: room.id });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    s.on('queue:leave', async (payload: { initialMs: number; incrementMs: number }, ack) => {
      await leaveQueue(userId, payload.initialMs, payload.incrementMs);
      ack?.({ ok: true });
    });

    s.on('match:move', async (payload: { matchId: string; uci: string }, ack) => {
      const room = getRoom(payload.matchId);
      if (!room) return ack?.({ ok: false, error: 'NO_MATCH' });
      const result = await playMove(room, userId, payload.uci);
      if (!result.ok) return ack?.(result);
      io.to(`match:${room.id}`).emit('match:move', {
        matchId: room.id,
        ply: result.ply,
        san: result.san,
        uci: result.uci,
        fenAfter: result.fenAfter,
        whiteMs: result.whiteMs,
        blackMs: result.blackMs,
        turn: result.turn,
      });
      if (result.gameOver) {
        io.to(`match:${room.id}`).emit('match:end', {
          matchId: room.id,
          outcome: result.gameOver.outcome,
          reason: result.gameOver.reason,
        });
      }
      ack?.(result);
    });

    s.on('match:resign', async (payload: { matchId: string }, ack) => {
      const room = getRoom(payload.matchId);
      if (!room) return ack?.({ ok: false, error: 'NO_MATCH' });
      await resign(room, userId);
      io.to(`match:${room.id}`).emit('match:end', {
        matchId: room.id,
        outcome: userId === room.whitePlayerId ? 'BLACK_WON' : 'WHITE_WON',
        reason: 'RESIGNATION',
      });
      ack?.({ ok: true });
    });

    s.on('match:offerDraw', async (payload: { matchId: string }, ack) => {
      const room = getRoom(payload.matchId);
      if (!room) return ack?.({ ok: false, error: 'NO_MATCH' });
      await offerDraw(room, userId);
      io.to(`match:${room.id}`).emit('match:drawOffer', { matchId: room.id, from: userId });
      ack?.({ ok: true });
    });

    s.on('match:acceptDraw', async (payload: { matchId: string }, ack) => {
      const room = getRoom(payload.matchId);
      if (!room) return ack?.({ ok: false, error: 'NO_MATCH' });
      await acceptDraw(room, userId);
      io.to(`match:${room.id}`).emit('match:end', {
        matchId: room.id,
        outcome: 'DRAW',
        reason: 'AGREEMENT',
      });
      ack?.({ ok: true });
    });
  });

  return io;
}
