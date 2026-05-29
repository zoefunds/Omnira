import type { Server } from 'socket.io';
import { prisma } from '@omnira/db';
import { tickTournamentStatuses, listStandings } from './service.js';

/**
 * Per-tournament "ready" set: users who have opted into pairing for this tournament.
 * In-memory because Phase 11B is single-server. Redis-backed in Phase 13 if we scale.
 */
const ready: Map<string /*tournamentId*/, Set<string /*userId*/>> = new Map();
/** Per-tournament currently-in-game set so we don't re-pair active players. */
const inGame: Map<string, Set<string>> = new Map();

function getReady(tid: string) {
  let s = ready.get(tid);
  if (!s) { s = new Set(); ready.set(tid, s); }
  return s;
}
function getInGame(tid: string) {
  let s = inGame.get(tid);
  if (!s) { s = new Set(); inGame.set(tid, s); }
  return s;
}

export function markReady(tournamentId: string, userId: string) {
  getReady(tournamentId).add(userId);
}

export function getReadyCount(tournamentId: string) { return getReady(tournamentId).size; }
export function getInGameCount(tournamentId: string) { return getInGame(tournamentId).size; }

let ioRef: Server | null = null;
export function broadcastQueueSummary(tournamentId: string) {
  if (!ioRef) return;
  ioRef.to(`tournament:${tournamentId}`).emit('tournament:queue:summary', {
    tournamentId,
    readyCount: getReadyCount(tournamentId),
    inGameCount: getInGameCount(tournamentId),
  });
}
export async function broadcastStandings(tournamentId: string) {
  if (!ioRef) return;
  const standings = await listStandings(tournamentId, 100);
  ioRef.to(`tournament:${tournamentId}`).emit('tournament:standings', { tournamentId, standings });
}
export function markNotReady(tournamentId: string, userId: string) {
  getReady(tournamentId).delete(userId);
}
export function markInGameStart(tournamentId: string, userId: string) {
  getInGame(tournamentId).add(userId);
  getReady(tournamentId).delete(userId); // pairing removes from ready
}
export function markInGameEnd(tournamentId: string, userId: string) {
  getInGame(tournamentId).delete(userId);
}
export function isReady(tournamentId: string, userId: string) {
  return getReady(tournamentId).has(userId);
}

/**
 * Closest-score pairing. Both players must be a participant, ready, and not in a game.
 * We sort by score desc and greedily pair adjacent compatible players.
 */
async function pairOneActiveTournament(
  tournamentId: string,
  io: Server,
  spawnMatchFn: (args: {
    whitePlayerId: string;
    blackPlayerId: string;
    initialMs: number;
    incrementMs: number;
    tournamentId: string;
  }) => Promise<{ id: string; game: { fen: () => string } }>,
): Promise<void> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, initialMs: true, incrementMs: true },
  });
  if (!t || t.status !== 'ACTIVE') return;

  const standings = await listStandings(tournamentId, 1000);
  const readySet = getReady(tournamentId);
  const inGameSet = getInGame(tournamentId);
  // Eligible = in standings, ready, not in game, not withdrew
  const eligible = standings
    .filter((p) => readySet.has(p.userId) && !inGameSet.has(p.userId) && !p.withdrew)
    .map((p) => ({ userId: p.userId, score: p.score }));

  // Sorted by score desc already (via listStandings)
  for (let i = 0; i + 1 < eligible.length; i += 2) {
    const a = eligible[i]!;
    const b = eligible[i + 1]!;
    // Random color
    const whiteFirst = Math.random() < 0.5;
    const whitePlayerId = whiteFirst ? a.userId : b.userId;
    const blackPlayerId = whiteFirst ? b.userId : a.userId;

    try {
      const room = await spawnMatchFn({
        whitePlayerId,
        blackPlayerId,
        initialMs: t.initialMs,
        incrementMs: t.incrementMs,
        tournamentId,
      });
      markInGameStart(tournamentId, whitePlayerId);
      markInGameStart(tournamentId, blackPlayerId);

      const start = {
        matchId: room.id,
        whitePlayerId,
        blackPlayerId,
        initialMs: t.initialMs,
        incrementMs: t.incrementMs,
        fen: room.game.fen(),
        startedAt: Date.now(),
        tournamentId,
      };
      io.to(`user:${whitePlayerId}`).to(`user:${blackPlayerId}`).emit('match:start', start);

      // Make sure both players' sockets join the match room.
      const sockets = await io.fetchSockets();
      for (const sock of sockets) {
        const uid = (sock.data as { userId?: string }).userId;
        if (uid === whitePlayerId || uid === blackPlayerId) sock.join(`match:${room.id}`);
      }
      io.to(`tournament:${tournamentId}`).emit('tournament:pair', {
        matchId: room.id, whitePlayerId, blackPlayerId,
      });
    } catch (e) {
      console.error('tournament pair failed', { tournamentId, err: (e as Error).message });
    }
  }
}

let statusInterval: NodeJS.Timeout | null = null;
let pairInterval: NodeJS.Timeout | null = null;

export function startTournamentRuntime(
  io: Server,
  spawnMatchFn: Parameters<typeof pairOneActiveTournament>[2],
): () => void {
  ioRef = io;
  // Status transitions every 10s.
  statusInterval = setInterval(async () => {
    try {
      const { activated, finished } = await tickTournamentStatuses();
      for (const id of activated) {
        io.to(`tournament:${id}`).emit('tournament:activated', { id });
      }
      for (const id of finished) {
        const standings = await listStandings(id, 50);
        io.to(`tournament:${id}`).emit('tournament:finished', { id, standings });
        ready.delete(id);
        inGame.delete(id);
      }
    } catch (e) {
      console.error('tournament status tick failed', (e as Error).message);
    }
  }, 10_000);

  // Pairing every 2s for each ACTIVE tournament.
  pairInterval = setInterval(async () => {
    try {
      const active = await prisma.tournament.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      for (const t of active) {
        await pairOneActiveTournament(t.id, io, spawnMatchFn);
      }
    } catch (e) {
      console.error('tournament pairing tick failed', (e as Error).message);
    }
  }, 2_000);

  return () => {
    if (statusInterval) clearInterval(statusInterval);
    if (pairInterval) clearInterval(pairInterval);
  };
}
