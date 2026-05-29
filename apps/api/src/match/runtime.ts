import {
  Game,
  newClock,
  startClock,
  onMove,
  stopClock,
  isFlagged,
  classify,
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
  tc: TimeControl;
  game: Game;
  clock: ClockState;
  ply: number;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  ended: boolean;
  drawOfferFrom: Color | null;
}

const rooms = new Map<string, MatchRoom>();

function getRatingForCategory(ratings: Array<{ category: string; rating: number }>, cat: string) {
  return ratings.find((r) => r.category === cat)?.rating ?? 1500;
}

export async function spawnMatch(args: {
  whitePlayerId: string;
  blackPlayerId: string;
  initialMs: number;
  incrementMs: number;
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
  });

  const room: MatchRoom = {
    id: dbMatch.id,
    whitePlayerId: args.whitePlayerId,
    blackPlayerId: args.blackPlayerId,
    tc,
    game: new Game(),
    clock: startClock(newClock(tc), Date.now()),
    ply: 0,
    whiteRatingBefore: wRating,
    blackRatingBefore: bRating,
    ended: false,
    drawOfferFrom: null,
  };
  rooms.set(room.id, room);
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
}

// Test/cleanup helper
export function _resetRooms() {
  rooms.clear();
}
