import { prisma } from '@omnira/db';
import { deriveAddress } from '../wallet/derive.js';
import { onchainEnabled } from '../config/env.js';
import {
  registerMatchOnchain,
  submitMovesBatchOnchain,
  finalizeMatchOnchain,
  type MoveBatchEntry,
} from './registry.js';

const FLUSH_EVERY_PLIES = 5;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

type Op =
  | {
      kind: 'register';
      matchId: string;
      whitePlayerId: string;
      blackPlayerId: string;
      initialMs: number;
      incrementMs: number;
    }
  | {
      kind: 'batch';
      matchId: string;
      moves: MoveBatchEntry[];
    }
  | {
      kind: 'finalize';
      matchId: string;
      status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
      resultReason: string;
      finalFen: string;
      pgn: string;
    };

interface PendingMatch {
  registered: boolean;
  pendingMoves: MoveBatchEntry[];
}

const pending = new Map<string, PendingMatch>();
const ops: Op[] = [];
let pumpRunning = false;
let pumpStarted = false;

function pmFor(matchId: string): PendingMatch {
  let pm = pending.get(matchId);
  if (!pm) {
    pm = { registered: false, pendingMoves: [] };
    pending.set(matchId, pm);
  }
  return pm;
}

function logCtx(matchId: string, msg: string, extra?: Record<string, unknown>) {
  // simple line log — pino is on the fastify side; this code lives outside a request
  console.log(JSON.stringify({ level: 30, comp: 'onchain', matchId, msg, ...extra }));
}

function logErr(matchId: string, err: unknown, extra?: Record<string, unknown>) {
  const e = err as { message?: string; shortMessage?: string };
  console.log(JSON.stringify({
    level: 50, comp: 'onchain', matchId,
    err: e?.shortMessage ?? e?.message ?? String(err),
    ...extra,
  }));
}

/** Public: called from the match runtime when a match starts. */
export async function enqueueRegister(input: {
  matchId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  initialMs: number;
  incrementMs: number;
}): Promise<void> {
  if (!onchainEnabled()) return;
  pmFor(input.matchId);
  ops.push({ kind: 'register', ...input });
  ensurePump();
}

/** Public: called from the match runtime after every successful move. */
export async function enqueueMove(matchId: string, move: MoveBatchEntry): Promise<void> {
  if (!onchainEnabled()) return;
  const pm = pmFor(matchId);
  pm.pendingMoves.push(move);
  if (pm.pendingMoves.length >= FLUSH_EVERY_PLIES) flushMoves(matchId);
  ensurePump();
}

/** Public: called from the match runtime when the match ends. */
export async function enqueueFinalize(input: {
  matchId: string;
  status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
  resultReason: string;
  finalFen: string;
  pgn: string;
}): Promise<void> {
  if (!onchainEnabled()) return;
  flushMoves(input.matchId); // ensure trailing moves go before finalize
  ops.push({ kind: 'finalize', ...input });
  ensurePump();
}

function flushMoves(matchId: string) {
  const pm = pending.get(matchId);
  if (!pm || pm.pendingMoves.length === 0) return;
  ops.push({ kind: 'batch', matchId, moves: pm.pendingMoves.slice() });
  pm.pendingMoves.length = 0;
}

function ensurePump() {
  if (!pumpStarted) {
    pumpStarted = true;
    setImmediate(pump);
  } else if (!pumpRunning) {
    setImmediate(pump);
  }
}

async function pump() {
  if (pumpRunning) return;
  pumpRunning = true;
  try {
    while (ops.length > 0) {
      const op = ops[0]!;
      const ok = await runOp(op);
      if (ok) {
        ops.shift();
      } else {
        await backoff();
      }
    }
  } finally {
    pumpRunning = false;
  }
}

let consecutiveFailures = 0;

async function backoff() {
  consecutiveFailures += 1;
  const ms = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (consecutiveFailures - 1));
  await new Promise((r) => setTimeout(r, ms));
}

async function runOp(op: Op): Promise<boolean> {
  try {
    if (op.kind === 'register') {
      const [whiteAddress, blackAddress] = await Promise.all([
        deriveAddress(op.whitePlayerId),
        deriveAddress(op.blackPlayerId),
      ]);
      logCtx(op.matchId, 'register: sending');
      const tx = await registerMatchOnchain({
        matchId: op.matchId,
        whiteAddress,
        blackAddress,
        initialMs: op.initialMs,
        incrementMs: op.incrementMs,
      });
      await prisma.match.update({
        where: { id: op.matchId },
        data: { onchainMatchId: op.matchId, onchainTxHash: tx },
      });
      pmFor(op.matchId).registered = true;
      consecutiveFailures = 0;
      logCtx(op.matchId, 'register: ok', { tx });
      return true;
    }

    if (op.kind === 'batch') {
      // Defensive: don't submit moves before register lands.
      if (!pmFor(op.matchId).registered) {
        return false;
      }
      logCtx(op.matchId, 'batch: sending', { count: op.moves.length });
      const tx = await submitMovesBatchOnchain(op.matchId, op.moves);
      const plies = op.moves.map((m) => m.ply);
      await prisma.move.updateMany({
        where: { matchId: op.matchId, ply: { in: plies } },
        data: { onchainTxHash: tx, onchainBatchId: tx },
      });
      consecutiveFailures = 0;
      logCtx(op.matchId, 'batch: ok', { tx, plies });
      return true;
    }

    if (op.kind === 'finalize') {
      if (!pmFor(op.matchId).registered) {
        return false;
      }
      logCtx(op.matchId, 'finalize: sending', { status: op.status });
      const tx = await finalizeMatchOnchain({
        matchId: op.matchId,
        status: op.status,
        resultReason: op.resultReason,
        finalFen: op.finalFen,
        pgn: op.pgn,
      });
      await prisma.match.update({
        where: { id: op.matchId },
        data: { onchainSettledAt: new Date() },
      });
      consecutiveFailures = 0;
      logCtx(op.matchId, 'finalize: ok', { tx });
      // Free per-match memory after we settle.
      pending.delete(op.matchId);
      return true;
    }
    return true;
  } catch (e) {
    logErr(op.matchId, e, { op: op.kind, consecutiveFailures: consecutiveFailures + 1 });
    return false;
  }
}

/** Public: explicit shutdown drain (used by tests / graceful stop). */
export async function drainQueue(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while ((ops.length > 0 || pumpRunning) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
  }
}
