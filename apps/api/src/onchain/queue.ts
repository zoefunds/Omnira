import { prisma } from '@omnira/db';
import { deriveAddress } from '../wallet/derive.js';
import { onchainEnabled } from '../config/env.js';
import {
  registerMatchOnchain,
  submitMovesBatchOnchain,
  finalizeMatchOnchain,
  type MoveBatchEntry,
} from './registry.js';

const FLUSH_EVERY_PLIES = 5;        // per color
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
      color: 'w' | 'b';
      moves: MoveBatchEntry[];
    }
  | {
      kind: 'finalize';
      matchId: string;
      signerUserId: string;
      status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
      resultReason: string;
      finalFen: string;
      pgn: string;
    };

interface PendingMatch {
  registered: boolean;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  pendingWhite: MoveBatchEntry[];
  pendingBlack: MoveBatchEntry[];
}

const pending = new Map<string, PendingMatch>();
const ops: Op[] = [];
let pumpRunning = false;
let pumpStarted = false;
let consecutiveFailures = 0;

function pmFor(matchId: string): PendingMatch {
  let pm = pending.get(matchId);
  if (!pm) {
    pm = {
      registered: false,
      whitePlayerId: null,
      blackPlayerId: null,
      pendingWhite: [],
      pendingBlack: [],
    };
    pending.set(matchId, pm);
  }
  return pm;
}

function log(matchId: string, msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'onchain', matchId, msg, ...extra }));
}
function logErr(matchId: string, err: unknown, extra?: Record<string, unknown>) {
  const e = err as { message?: string; shortMessage?: string };
  console.log(JSON.stringify({
    level: 50, comp: 'onchain', matchId,
    err: e?.shortMessage ?? e?.message ?? String(err), ...extra,
  }));
}

export async function enqueueRegister(input: {
  matchId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  initialMs: number;
  incrementMs: number;
}): Promise<void> {
  if (!onchainEnabled()) return;
  const pm = pmFor(input.matchId);
  pm.whitePlayerId = input.whitePlayerId;
  pm.blackPlayerId = input.blackPlayerId;
  ops.push({ kind: 'register', ...input });
  ensurePump();
}

export async function enqueueMove(matchId: string, move: MoveBatchEntry): Promise<void> {
  if (!onchainEnabled()) return;
  const pm = pmFor(matchId);
  const isWhite = move.ply % 2 === 1;
  if (isWhite) pm.pendingWhite.push(move);
  else         pm.pendingBlack.push(move);
  if (isWhite && pm.pendingWhite.length >= FLUSH_EVERY_PLIES) flushColor(matchId, 'w');
  if (!isWhite && pm.pendingBlack.length >= FLUSH_EVERY_PLIES) flushColor(matchId, 'b');
  ensurePump();
}

export async function enqueueFinalize(input: {
  matchId: string;
  signerUserId: string;
  status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
  resultReason: string;
  finalFen: string;
  pgn: string;
}): Promise<void> {
  if (!onchainEnabled()) return;
  flushColor(input.matchId, 'w');
  flushColor(input.matchId, 'b');
  ops.push({ kind: 'finalize', ...input });
  ensurePump();
}

function flushColor(matchId: string, color: 'w' | 'b') {
  const pm = pending.get(matchId);
  if (!pm) return;
  const bucket = color === 'w' ? pm.pendingWhite : pm.pendingBlack;
  if (bucket.length === 0) return;
  ops.push({ kind: 'batch', matchId, color, moves: bucket.slice() });
  bucket.length = 0;
}

function ensurePump() {
  if (!pumpStarted) { pumpStarted = true; setImmediate(pump); }
  else if (!pumpRunning) setImmediate(pump);
}

async function pump() {
  if (pumpRunning) return;
  pumpRunning = true;
  try {
    while (ops.length > 0) {
      const op = ops[0]!;
      const ok = await runOp(op);
      if (ok) ops.shift();
      else await backoff();
    }
  } finally {
    pumpRunning = false;
  }
}

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
      log(op.matchId, 'register: sending');
      const tx = await registerMatchOnchain({
        matchId: op.matchId,
        whitePlayerId: op.whitePlayerId,
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
      log(op.matchId, 'register: ok', { tx });
      return true;
    }

    if (op.kind === 'batch') {
      const pm = pmFor(op.matchId);
      if (!pm.registered) return false;
      const signerUserId = op.color === 'w' ? pm.whitePlayerId : pm.blackPlayerId;
      if (!signerUserId) return false;

      log(op.matchId, 'batch: sending', { color: op.color, count: op.moves.length });
      const tx = await submitMovesBatchOnchain(op.matchId, signerUserId, op.moves);
      const plies = op.moves.map((m) => m.ply);
      await prisma.move.updateMany({
        where: { matchId: op.matchId, ply: { in: plies } },
        data: { onchainTxHash: tx, onchainBatchId: tx },
      });
      consecutiveFailures = 0;
      log(op.matchId, 'batch: ok', { color: op.color, tx, plies });
      return true;
    }

    if (op.kind === 'finalize') {
      const pm = pmFor(op.matchId);
      if (!pm.registered) return false;
      log(op.matchId, 'finalize: sending', { status: op.status, signer: op.signerUserId });
      const tx = await finalizeMatchOnchain({
        matchId: op.matchId,
        signerUserId: op.signerUserId,
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
      log(op.matchId, 'finalize: ok', { tx });
      pending.delete(op.matchId);
      return true;
    }
    return true;
  } catch (e) {
    logErr(op.matchId, e, { op: op.kind, consecutiveFailures: consecutiveFailures + 1 });
    return false;
  }
}

export async function drainQueue(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while ((ops.length > 0 || pumpRunning) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
  }
}
