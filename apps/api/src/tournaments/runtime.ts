import type { Server } from 'socket.io';
import { prisma } from '@omnira/db';
import { tickTournamentStatuses, listStandings } from './service.js';
import { deriveAddress } from '../wallet/derive.js';
import { registerTournamentOnchain, finalizeTournamentOnchain } from '../onchain/tournamentRegistry.js';
import { prisma as _prisma } from '@omnira/db';

/**
 * Per-tournament "ready" set: users who have opted into pairing for this tournament.
 * In-memory because Phase 11B is single-server. Redis-backed in Phase 13 if we scale.
 */
const ready: Map<string /*tournamentId*/, Set<string /*userId*/>> = new Map();
/** After a tournament game ends, both players sit out the pairing pool for
 *  this many ms so they can see the result before the next board appears. */
export const POST_GAME_COOLDOWN_MS = 5_000;
/** userId → epoch ms when they become eligible for pairing again. */
const cooldownUntil: Map<string, number> = new Map();

export function applyPostGameCooldown(userId: string) {
  cooldownUntil.set(userId, Date.now() + POST_GAME_COOLDOWN_MS);
  // Auto-expire so the map doesn't grow forever
  setTimeout(() => {
    const t = cooldownUntil.get(userId);
    if (t && t <= Date.now()) cooldownUntil.delete(userId);
  }, POST_GAME_COOLDOWN_MS + 100);
}

function isCoolingDown(userId: string): boolean {
  const t = cooldownUntil.get(userId);
  if (!t) return false;
  if (t <= Date.now()) {
    cooldownUntil.delete(userId);
    return false;
  }
  return true;
}

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
  // Try to pair immediately — no need to wait for the next 750ms tick when
  // two players are simultaneously ready.
  if (ioRef && lastSpawnFn) {
    void pairOneActiveTournament(tournamentId, ioRef, lastSpawnFn).catch((e) =>
      console.error('eager pair failed', (e as Error).message),
    );
  }
}

let lastSpawnFn: Parameters<typeof pairOneActiveTournament>[2] | null = null;

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
  const standings = await listStandings(tournamentId, 1000);
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
/**
 * For each player in the candidate list, find the userId of their most
 * recent opponent within this tournament. Used to break the rematch loop
 * that otherwise pairs two finishers back together immediately.
 */
async function getLastOpponentMap(
  tournamentId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  // Pull the most recent match per player. One query is fine at this scale.
  const recent = await prisma.match.findMany({
    where: {
      tournamentId,
      OR: [{ whitePlayerId: { in: userIds } }, { blackPlayerId: { in: userIds } }],
      status: { in: ['ACTIVE', 'WHITE_WON', 'BLACK_WON', 'DRAW'] },
    },
    orderBy: { startedAt: 'desc' },
    select: { whitePlayerId: true, blackPlayerId: true, startedAt: true },
    take: userIds.length * 4, // each player can appear in many matches; we just need the freshest
  });
  const map = new Map<string, string>();
  for (const m of recent) {
    if (!map.has(m.whitePlayerId)) map.set(m.whitePlayerId, m.blackPlayerId);
    if (!map.has(m.blackPlayerId)) map.set(m.blackPlayerId, m.whitePlayerId);
  }
  return map;
}

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
  // Eligible = in standings, ready, not in game, not withdrew, not cooling
  // down from a just-finished game.
  const eligible = standings
    .filter(
      (p) =>
        readySet.has(p.userId) &&
        !inGameSet.has(p.userId) &&
        !p.withdrew &&
        !isCoolingDown(p.userId),
    )
    .map((p) => ({ userId: p.userId, score: p.score }));

  if (eligible.length < 2) return;

  // Lichess-style anti-rematch: for each candidate pair (i, i+1) in the
  // score-sorted list, look up the previous opponent of player i. If it's
  // player i+1 *and* there's another option available, slide i+1 down the
  // list one slot. Avoids the "same two players paired N times in a row" bug
  // we hit after auto-rejoin pool started instantly re-queueing finishers.
  const lastOpponent = await getLastOpponentMap(tournamentId, eligible.map((e) => e.userId));

  const paired = new Set<string>();
  const pairs: Array<{ a: { userId: string }; b: { userId: string } }> = [];
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i]!;
    if (paired.has(a.userId)) continue;
    // Find the first remaining player who isn't a's last opponent, falling
    // back to the next available if no such candidate exists.
    let bIdx = -1;
    let fallbackIdx = -1;
    for (let j = i + 1; j < eligible.length; j++) {
      const cand = eligible[j]!;
      if (paired.has(cand.userId)) continue;
      if (fallbackIdx === -1) fallbackIdx = j;
      if (lastOpponent.get(a.userId) !== cand.userId) {
        bIdx = j;
        break;
      }
    }
    if (bIdx === -1) bIdx = fallbackIdx;
    if (bIdx === -1) continue;
    const b = eligible[bIdx]!;
    paired.add(a.userId);
    paired.add(b.userId);
    pairs.push({ a, b });
  }

  for (const { a, b } of pairs) {
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

      const [wpt, bpt] = await Promise.all([
        prisma.user.findUnique({ where: { id: whitePlayerId }, select: { username: true } }),
        prisma.user.findUnique({ where: { id: blackPlayerId }, select: { username: true } }),
      ]);
      const start = {
        matchId: room.id,
        whitePlayerId,
        blackPlayerId,
        whiteUsername: wpt?.username ?? null,
        blackUsername: bpt?.username ?? null,
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
  lastSpawnFn = spawnMatchFn;
  // Status transitions every 10s.
  statusInterval = setInterval(async () => {
    try {
      const { activated, finished } = await tickTournamentStatuses();
      for (const id of activated) {
        io.to(`tournament:${id}`).emit('tournament:activated', { id });
        void (async () => {
          try {
            const t = await _prisma.tournament.findUnique({ where: { id } });
            if (!t) return;
            const hostAddress = await deriveAddress(t.createdById);
            const tx = await registerTournamentOnchain({
              tournamentId: id,
              hostUserId: t.createdById,
              hostAddress,
              name: t.name,
              initialMs: t.initialMs,
              incrementMs: t.incrementMs,
              startsAtSec: Math.floor(t.startsAt.getTime() / 1000),
              durationMs: t.durationMs,
            });
            await _prisma.tournament.update({ where: { id }, data: { onchainTxHash: tx } });
            console.log(JSON.stringify({ level: 30, comp: 'tournament/onchain', msg: 'registered', id, tx }));
          } catch (e) {
            console.log(JSON.stringify({ level: 50, comp: 'tournament/onchain', msg: 'register failed', id, err: (e as Error).message }));
          }
        })();
      }
      for (const id of finished) {
        const standings = await listStandings(id, 50);
        io.to(`tournament:${id}`).emit('tournament:finished', { id, standings });
        ready.delete(id);
        inGame.delete(id);
        void (async () => {
          try {
            const t = await _prisma.tournament.findUnique({ where: { id } });
            if (!t || !t.onchainTxHash) return;
            const top = standings.slice(0, 10);
            if (top.length === 0) return;
            const entries = await Promise.all(top.map(async (p, i) => ({
              rank: i + 1,
              playerAddress: await deriveAddress(p.userId),
              score: p.score,
              wins: p.wins,
              losses: p.losses,
              draws: p.draws,
            })));
            const tx = await finalizeTournamentOnchain(id, t.createdById, entries);
            await _prisma.tournament.update({
              where: { id },
              data: { onchainSettledTxHash: tx, onchainSettledAt: new Date() },
            });
            console.log(JSON.stringify({ level: 30, comp: 'tournament/onchain', msg: 'finalized', id, tx, top: entries.length }));
          } catch (e) {
            console.log(JSON.stringify({ level: 50, comp: 'tournament/onchain', msg: 'finalize failed', id, err: (e as Error).message }));
          }
        })();
      }
    } catch (e) {
      console.error('tournament status tick failed', (e as Error).message);
    }
  }, 10_000);

  // Pairing every 750ms for each ACTIVE tournament — fast enough to feel
  // instant when two players are both ready, light enough at idle.
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
  }, 750);

  return () => {
    if (statusInterval) clearInterval(statusInterval);
    if (pairInterval) clearInterval(pairInterval);
  };
}
