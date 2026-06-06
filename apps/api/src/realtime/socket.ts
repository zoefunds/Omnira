import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { joinOrMatch, leaveQueue } from '../matchmaking/queue.js';
import { spawnMatch, getRoom, playMove, resign, offerDraw, acceptDraw, setMatchEndBroadcaster } from '../match/runtime.js';
import { prisma } from '@omnira/db';
import { acceptChallenge, resolveColors, linkMatch, ChallengeError } from '../lobby/service.js';
import { postMessage, ChatError } from '../chat/service.js';
import { markReady, markNotReady, broadcastQueueSummary, isReady, getReadyCount, getInGameCount } from '../tournaments/runtime.js';

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

    /** Reject events from users whose email isn't verified yet. */
    async function requireVerified(): Promise<boolean> {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerified: true },
      });
      return Boolean(u?.emailVerified);
    }

    s.on('queue:join', async (payload: { initialMs: number; incrementMs: number }, ack) => {
      try {
        if (!(await requireVerified())) {
          return ack?.({ ok: false, error: 'EMAIL_NOT_VERIFIED' });
        }
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

        const [wp, bp] = await Promise.all([
          prisma.user.findUnique({ where: { id: whitePlayerId }, select: { username: true } }),
          prisma.user.findUnique({ where: { id: blackPlayerId }, select: { username: true } }),
        ]);
        const start = {
          matchId: room.id,
          whitePlayerId,
          blackPlayerId,
          whiteUsername: wp?.username ?? null,
          blackUsername: bp?.username ?? null,
          initialMs: payload.initialMs,
          incrementMs: payload.incrementMs,
          fen: room.game.fen(),
          startedAt: Date.now(),
          // Echo the queue settings so the client can auto-rejoin on game end.
          queueRejoin: { initialMs: payload.initialMs, incrementMs: payload.incrementMs },
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


    // Rejoin a player's own active match's broadcast room after a page reload
    // or socket reconnect. Does NOT change game state — just resubscribes.
    s.on('match:rejoin', async (payload: { matchId: string }, ack) => {
      const room = getRoom(payload.matchId);
      if (!room) return ack?.({ ok: false, error: 'NO_MATCH' });
      if (room.whitePlayerId !== userId && room.blackPlayerId !== userId) {
        return ack?.({ ok: false, error: 'FORBIDDEN' });
      }
      s.join(`match:${room.id}`);
      ack?.({ ok: true });
    });

    s.on('match:watch', async (payload: { matchId: string }, ack) => {
      if (!/^[0-9a-fA-F-]{36}$/.test(payload.matchId)) return ack?.({ ok: false, error: 'BAD_ID' });
      s.join(`match:${payload.matchId}`);
      ack?.({ ok: true });
    });
    s.on('match:unwatch', async (payload: { matchId: string }, ack) => {
      s.leave(`match:${payload.matchId}`);
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

    s.on('lobby:subscribe', async (_payload, ack) => {
      s.join('lobby:public');
      ack?.({ ok: true });
    });

    s.on('lobby:unsubscribe', async (_payload, ack) => {
      s.leave('lobby:public');
      ack?.({ ok: true });
    });


    s.on('tournament:subscribe', async (payload: { tournamentId: string }, ack) => {
      s.join(`tournament:${payload.tournamentId}`);
      // Snapshot current state so the client doesn't show "Join queue" while
      // the server already has them in the pool (common after match end →
      // auto-rejoin → navigate back to the tournament page).
      s.emit('tournament:queue:state', {
        tournamentId: payload.tournamentId,
        userId,
        ready: isReady(payload.tournamentId, userId),
      });
      s.emit('tournament:queue:summary', {
        tournamentId: payload.tournamentId,
        readyCount: getReadyCount(payload.tournamentId),
        inGameCount: getInGameCount(payload.tournamentId),
      });
      ack?.({ ok: true });
    });
    s.on('tournament:unsubscribe', async (payload: { tournamentId: string }, ack) => {
      s.leave(`tournament:${payload.tournamentId}`);
      ack?.({ ok: true });
    });
    s.on('tournament:queue:join', async (payload: { tournamentId: string }, ack) => {
      markReady(payload.tournamentId, userId);
      io.to(`tournament:${payload.tournamentId}`).emit('tournament:queue:state', {
        tournamentId: payload.tournamentId, userId, ready: true,
      });
      broadcastQueueSummary(payload.tournamentId);
      ack?.({ ok: true });
    });
    s.on('tournament:queue:leave', async (payload: { tournamentId: string }, ack) => {
      markNotReady(payload.tournamentId, userId);
      io.to(`tournament:${payload.tournamentId}`).emit('tournament:queue:state', {
        tournamentId: payload.tournamentId, userId, ready: false,
      });
      broadcastQueueSummary(payload.tournamentId);
      ack?.({ ok: true });
    });

    s.on('challenge:accept', async (payload: { code: string }, ack) => {
      try {
        if (!(await requireVerified())) {
          return ack?.({ ok: false, error: 'EMAIL_NOT_VERIFIED' });
        }
        const ch = await acceptChallenge(payload.code, userId);
        const { whitePlayerId, blackPlayerId } = resolveColors(
          ch.creatorId,
          ch.acceptedById!,
          ch.colorPreference,
        );

        const room = await spawnMatch({
          whitePlayerId,
          blackPlayerId,
          initialMs: ch.initialMs,
          incrementMs: ch.incrementMs,
        });
        await linkMatch(ch.id, room.id);

        const [wp2, bp2] = await Promise.all([
          prisma.user.findUnique({ where: { id: whitePlayerId }, select: { username: true } }),
          prisma.user.findUnique({ where: { id: blackPlayerId }, select: { username: true } }),
        ]);
        const start = {
          matchId: room.id,
          whitePlayerId,
          blackPlayerId,
          whiteUsername: wp2?.username ?? null,
          blackUsername: bp2?.username ?? null,
          initialMs: ch.initialMs,
          incrementMs: ch.incrementMs,
          fen: room.game.fen(),
          startedAt: Date.now(),
        };
        io.to(`user:${whitePlayerId}`).to(`user:${blackPlayerId}`).emit('match:start', start);

        const sockets = await io.fetchSockets();
        for (const sock of sockets) {
          const uid = (sock.data as { userId?: string }).userId;
          if (uid === whitePlayerId || uid === blackPlayerId) sock.join(`match:${room.id}`);
        }

        io.to('lobby:public').emit('challenge:accepted', { code: ch.code, matchId: room.id });
        ack?.({ ok: true, matchId: room.id });
      } catch (e) {
        if (e instanceof ChallengeError) return ack?.({ ok: false, error: e.code });
        ack?.({ ok: false, error: 'INTERNAL' });
      }
    });

    s.on('chat:send', async (payload: { matchId: string; body: string }, ack) => {
      try {
        const msg = await postMessage(payload.matchId, userId, payload.body);
        io.to(`match:${payload.matchId}`).emit('chat:message', {
          id: msg.id,
          matchId: payload.matchId,
          senderId: msg.senderId,
          senderUsername: msg.sender.username,
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        });
        ack?.({ ok: true });
      } catch (e) {
        if (e instanceof ChatError) return ack?.({ ok: false, error: e.code });
        ack?.({ ok: false, error: 'INTERNAL' });
      }
    });


  });

  // Allow the match runtime to broadcast no-show forfeits back through io.
  setMatchEndBroadcaster((room, outcome, reason) => {
    io.to(`match:${room.id}`).emit('match:end', {
      matchId: room.id,
      outcome,
      reason,
    });
  });

  return io;
}
