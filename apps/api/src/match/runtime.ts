import {
  Game,
  newClock,
  startClock,
  onMove,
  stopClock,
  isFlagged,
  classify,
  remainingMs,
  type ClockState,
  type TimeControl,
  type GameOverState,
  type Color,
} from '@omnira/chess-engine';
import { prisma } from '@omnira/db';
import { enqueueRegister, enqueueMove, enqueueFinalize } from '../onchain/queue.js';
import { createMatch, recordMove, endMatch, updateRating } from './service.js';
import { applyElo } from '../rating/elo.js';

export interface MatchRoom {
  id: string;                // DB match id
  whitePlayerId: string;
  blackPlayerId: string;
  tournamentId: string | null;
  tc: TimeControl;
  game: Game;
  clock: ClockState;
  ply: number;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  ended: boolean;
  drawOfferFrom: Color | null;
  /** Timer that auto-forfeits if the next-to-move side hasn't played within
   *  FIRST_MOVE_TIMEOUT_MS. Re-armed after the first move; cleared when the
   *  game is over. */
  firstMoveTimer: NodeJS.Timeout | null;
}

/** Each side gets 15 seconds to play their first/second move or they forfeit
 *  (lichess "no-show" pattern). Cleared after black plays move 2. */
export const FIRST_MOVE_TIMEOUT_MS = 15_000;

const rooms = new Map<string, MatchRoom>();

function getRatingForCategory(ratings: Array<{ category: string; rating: number }>, cat: string) {
  return ratings.find((r) => r.category === cat)?.rating ?? 1500;
}

export async function spawnMatch(args: {
  whitePlayerId: string;
  blackPlayerId: string;
  initialMs: number;
  incrementMs: number;
  tournamentId?: string | null;
}): Promise<MatchRoom> {
  const category = classify(args.initialMs, args.incrementMs);
  const tc: TimeControl = { category, initialMs: args.initialMs, incrementMs: args.incrementMs };

  const [wRatings, bRatings] = await Promise.all([
    prisma.rating.findMany({ where: { userId: args.whitePlayerId } }),
    prisma.rating.findMany({ where: { userId: args.blackPlayerId } }),
  ]);
  const wRating = getRatingForCategory(wRatings, category);
  const bRating = getRatingForCategory(bRatings, category);

  const dbMatch = await createMatch({
    whitePlayerId: args.whitePlayerId,
    blackPlayerId: args.blackPlayerId,
    category,
    initialMs: args.initialMs,
    incrementMs: args.incrementMs,
    whiteRatingBefore: wRating,
    blackRatingBefore: bRating,
    tournamentId: args.tournamentId ?? null,
  });

  const room: MatchRoom = {
    id: dbMatch.id,
    whitePlayerId: args.whitePlayerId,
    blackPlayerId: args.blackPlayerId,
    tournamentId: args.tournamentId ?? null,
    tc,
    game: new Game(),
    clock: startClock(newClock(tc), Date.now()),
    ply: 0,
    whiteRatingBefore: wRating,
    blackRatingBefore: bRating,
    ended: false,
    drawOfferFrom: null,
    firstMoveTimer: null,
  };
  rooms.set(room.id, room);
  armFirstMoveTimer(room);
  // fire-and-forget onchain registration
  void enqueueRegister({
    matchId: room.id,
    whitePlayerId: args.whitePlayerId,
    blackPlayerId: args.blackPlayerId,
    initialMs: args.initialMs,
    incrementMs: args.incrementMs,
  });
  return room;
}

export function getRoom(matchId: string): MatchRoom | undefined {
  return rooms.get(matchId);
}

export function colorForUser(room: MatchRoom, userId: string): Color | null {
  if (userId === room.whitePlayerId) return 'w';
  if (userId === room.blackPlayerId) return 'b';
  return null;
}

export interface MoveOk {
  ok: true;
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  whiteMs: number;
  blackMs: number;
  turn: Color;
  gameOver: GameOverState | null;
}
export interface MoveErr {
  ok: false;
  error: string;
}

export async function playMove(
  room: MatchRoom,
  userId: string,
  uci: string,
  now: number = Date.now(),
): Promise<MoveOk | MoveErr> {
  if (room.ended) return { ok: false, error: 'GAME_OVER' };
  const color = colorForUser(room, userId);
  if (!color) return { ok: false, error: 'NOT_A_PLAYER' };
  if (color !== room.game.turn()) return { ok: false, error: 'NOT_YOUR_TURN' };

  const flagged = isFlagged(room.clock, now);
  if (flagged) {
    await finalizeOnTimeout(room, flagged, now);
    return { ok: false, error: 'TIMEOUT' };
  }

  let result;
  try {
    result = room.game.applyMove(uci);
  } catch {
    return { ok: false, error: 'ILLEGAL_MOVE' };
  }

  const clockUpdate = onMove(room.clock, room.tc, now);
  room.clock = clockUpdate.next;
  room.ply = result.ply;
  room.drawOfferFrom = null;

  // First-move forfeit handling. After white plays move 1, re-arm for black's
  // move 2. After black plays move 2, the clock has fully started and the
  // normal timeout machinery takes over.
  if (room.firstMoveTimer && (result.ply === 1 || result.ply >= 2)) {
    clearTimeout(room.firstMoveTimer);
    room.firstMoveTimer = null;
  }
  if (result.ply === 1) armFirstMoveTimer(room);

  await recordMove({
    matchId: room.id,
    ply: result.ply,
    san: result.san,
    uci: result.uci,
    fenAfter: result.fenAfter,
    clockMsWhite: clockUpdate.whiteMs,
    clockMsBlack: clockUpdate.blackMs,
    thinkMs: clockUpdate.thinkMs,
  });
  void enqueueMove(room.id, {
    ply: result.ply,
    san: result.san,
    uci: result.uci,
    fenAfter: result.fenAfter,
    clockMsWhite: clockUpdate.whiteMs,
    clockMsBlack: clockUpdate.blackMs,
    thinkMs: clockUpdate.thinkMs,
  });

  if (result.gameOver) {
    await finalize(room, result.gameOver, now, color);
  }

  return {
    ok: true,
    ply: result.ply,
    san: result.san,
    uci: result.uci,
    fenAfter: result.fenAfter,
    whiteMs: clockUpdate.whiteMs,
    blackMs: clockUpdate.blackMs,
    turn: result.turn,
    gameOver: result.gameOver,
  };
}

export async function resign(room: MatchRoom, userId: string, now: number = Date.now()) {
  if (room.ended) return;
  const color = colorForUser(room, userId);
  if (!color) return;
  const winner = color === 'w' ? 'BLACK_WON' : 'WHITE_WON';
  await finalize(room, { outcome: winner, reason: 'RESIGNATION' }, now, color);
}

export async function offerDraw(room: MatchRoom, userId: string) {
  if (room.ended) return;
  const color = colorForUser(room, userId);
  if (!color) return;
  room.drawOfferFrom = color;
}

export async function acceptDraw(room: MatchRoom, userId: string, now: number = Date.now()) {
  if (room.ended) return;
  const color = colorForUser(room, userId);
  if (!color) return;
  if (!room.drawOfferFrom || room.drawOfferFrom === color) return;
  await finalize(room, { outcome: 'DRAW', reason: 'AGREEMENT' }, now, color);
}

async function finalizeOnTimeout(room: MatchRoom, flagged: Color, now: number) {
  const outcome = flagged === 'w' ? 'BLACK_WON' : 'WHITE_WON';
  const trigger: Color = flagged === 'w' ? 'b' : 'w';
  await finalize(room, { outcome, reason: 'TIMEOUT' }, now, trigger);
}

async function finalize(room: MatchRoom, gameOver: GameOverState, now: number, triggeredBy: Color) {
  if (room.ended) return;
  room.ended = true;
  room.clock = stopClock(room.clock, now);
  if (room.firstMoveTimer) {
    clearTimeout(room.firstMoveTimer);
    room.firstMoveTimer = null;
  }

  const elo = applyElo(
    { rating: room.whiteRatingBefore, gamesPlayed: 0 },
    { rating: room.blackRatingBefore, gamesPlayed: 0 },
    gameOver.outcome,
  );

  await endMatch({
    matchId: room.id,
    status: gameOver.outcome,
    reason: gameOver.reason,
    finalFen: room.game.fen(),
    pgn: room.game.pgn(),
    whiteRatingAfter: elo.whiteAfter,
    blackRatingAfter: elo.blackAfter,
  });

  await updateRating({ userId: room.whitePlayerId, category: room.tc.category, newRating: elo.whiteAfter });
  await updateRating({ userId: room.blackPlayerId, category: room.tc.category, newRating: elo.blackAfter });
  const signerUserId = triggeredBy === 'w' ? room.whitePlayerId : room.blackPlayerId;
  void enqueueFinalize({
    matchId: room.id,
    signerUserId,
    status: gameOver.outcome as 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED',
    resultReason: gameOver.reason,
    finalFen: room.game.fen(),
    pgn: room.game.pgn(),
  });

  // Tournament score + ready-set release
  if (room.tournamentId && gameOver.outcome !== 'ABORTED') {
    try {
      const { applyMatchResultToTournament } = await import('../tournaments/scoring.js');
      const { markInGameEnd } = await import('../tournaments/runtime.js');
      await applyMatchResultToTournament({
        tournamentId: room.tournamentId,
        whitePlayerId: room.whitePlayerId,
        blackPlayerId: room.blackPlayerId,
        outcome: gameOver.outcome as 'WHITE_WON' | 'BLACK_WON' | 'DRAW',
      });
      markInGameEnd(room.tournamentId, room.whitePlayerId);
      markInGameEnd(room.tournamentId, room.blackPlayerId);
      // Lichess-arena behavior: both players go straight back into the pool
      // unless they explicitly withdrew. The next pairing tick (or eager pair
      // triggered inside markReady) puts them into a new game in ≤1 second.
      const { markReady, broadcastStandings, broadcastQueueSummary } = await import('../tournaments/runtime.js');
      const t = await prisma.tournament.findUnique({
        where: { id: room.tournamentId },
        select: { status: true },
      });
      if (t?.status === 'ACTIVE') {
        const tps = await prisma.tournamentPlayer.findMany({
          where: { tournamentId: room.tournamentId, userId: { in: [room.whitePlayerId, room.blackPlayerId] }, withdrew: false },
          select: { userId: true },
        });
        for (const p of tps) markReady(room.tournamentId, p.userId);
      }
      await broadcastStandings(room.tournamentId);
      broadcastQueueSummary(room.tournamentId);
    } catch (e) {
      console.error('tournament scoring failed', { matchId: room.id, err: (e as Error).message });
    }
  }
}

/** Caller (socket.ts) registers a callback so the runtime can broadcast a
 *  game-over event for no-show forfeits without importing the io instance. */
type EndBroadcaster = (room: MatchRoom, outcome: 'WHITE_WON' | 'BLACK_WON', reason: 'NO_SHOW') => void;
let endBroadcaster: EndBroadcaster | null = null;
export function setMatchEndBroadcaster(fn: EndBroadcaster) {
  endBroadcaster = fn;
}

function armFirstMoveTimer(room: MatchRoom) {
  if (room.firstMoveTimer) clearTimeout(room.firstMoveTimer);
  room.firstMoveTimer = setTimeout(async () => {
    if (room.ended) return;
    const noShowSide = room.game.turn(); // the side that failed to move
    const outcome = noShowSide === 'w' ? 'BLACK_WON' : 'WHITE_WON';
    const winnerColor: Color = noShowSide === 'w' ? 'b' : 'w';
    await finalize(room, { outcome, reason: 'NO_SHOW' }, Date.now(), winnerColor);
    endBroadcaster?.(room, outcome, 'NO_SHOW');
  }, FIRST_MOVE_TIMEOUT_MS);
}

// Test/cleanup helper
export function _resetRooms() {
  rooms.clear();
}

/** Snapshot the in-memory room state so a reconnecting client can rehydrate. */
export function snapshotRoom(room: MatchRoom, now: number = Date.now()): {
  matchId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  fen: string;
  initialMs: number;
  incrementMs: number;
  whiteMs: number;
  blackMs: number;
  turn: Color;
  ply: number;
  history: Array<{ ply: number; san: string; uci: string }>;
  ended: boolean;
  drawOfferFrom: Color | null;
} {
  // Compute live clocks at "now" by subtracting elapsed since clock.tickFrom.
  const live = remainingMs(room.clock, now);
  // Use verbose history so we can reconstruct proper UCI strings (from, to,
  // promotion). Each entry is { from, to, promotion?, san, ... }.
  const verbose = room.game.history({ verbose: true }) as Array<{
    from: string;
    to: string;
    promotion?: string;
    san: string;
  }>;
  return {
    matchId: room.id,
    whitePlayerId: room.whitePlayerId,
    blackPlayerId: room.blackPlayerId,
    fen: room.game.fen(),
    initialMs: room.tc.initialMs,
    incrementMs: room.tc.incrementMs,
    whiteMs: live.whiteMs,
    blackMs: live.blackMs,
    turn: room.game.turn(),
    ply: room.ply,
    history: verbose.map((mv, i) => ({
      ply: i + 1,
      san: mv.san,
      uci: `${mv.from}${mv.to}${mv.promotion ?? ''}`,
    })),
    ended: room.ended,
    drawOfferFrom: room.drawOfferFrom,
  };
}

/** Listing for the spectator grid — rooms in memory only (no DB ghosts). */
export function listLiveRoomIds(): string[] {
  return Array.from(rooms.keys());
}
