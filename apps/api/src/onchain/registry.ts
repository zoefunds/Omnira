import { TransactionStatus, CalldataAddress } from 'genlayer-js/types';
import { onchain, registryAddress } from './client.js';
import { clientForUser } from './clientForUser.js';

function addr(hex: string): CalldataAddress {
  const clean = hex.toLowerCase().replace(/^0x/, '');
  if (clean.length !== 40) throw new Error(`bad address: ${hex}`);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new CalldataAddress(bytes);
}

async function writeAndWait(
  client: ReturnType<typeof onchain>,
  args: Parameters<ReturnType<typeof onchain>['writeContract']>[0],
): Promise<`0x${string}`> {
  const hash = (await client.writeContract(args)) as `0x${string}`;
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
  return hash;
}

export interface RegisterMatchInput {
  matchId: string;
  whitePlayerId: string;          // signs (must equal white)
  whiteAddress: `0x${string}`;
  blackAddress: `0x${string}`;
  initialMs: number;
  incrementMs: number;
}

export async function registerMatchOnchain(input: RegisterMatchInput): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(input.whitePlayerId);
  return writeAndWait(client, {
    account,
    address: registryAddress(),
    functionName: 'register_match',
    args: [
      input.matchId,
      addr(input.whiteAddress),
      addr(input.blackAddress),
      BigInt(input.initialMs),
      BigInt(input.incrementMs),
    ],
  });
}

export interface MoveBatchEntry {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  clockMsWhite: number;
  clockMsBlack: number;
  thinkMs: number;
}

/**
 * Submit a single-color batch.
 * - `signerUserId` is the player whose color these moves belong to.
 * - All `batch[i].ply` values must share the same parity (odd=white, even=black).
 */
export async function submitMovesBatchOnchain(
  matchId: string,
  signerUserId: string,
  batch: MoveBatchEntry[],
): Promise<`0x${string}`> {
  if (batch.length === 0) throw new Error('empty batch');
  const expectedParity = batch[0]!.ply % 2;
  for (const m of batch) {
    if (m.ply % 2 !== expectedParity) {
      throw new Error('mixed-color batch passed to submitMovesBatchOnchain');
    }
  }
  const { client, account } = await clientForUser(signerUserId);
  return writeAndWait(client, {
    account,
    address: registryAddress(),
    functionName: 'submit_moves_batch',
    args: [
      matchId,
      batch.map((m) => BigInt(m.ply)),
      batch.map((m) => m.san),
      batch.map((m) => m.uci),
      batch.map((m) => m.fenAfter),
      batch.map((m) => BigInt(m.clockMsWhite)),
      batch.map((m) => BigInt(m.clockMsBlack)),
      batch.map((m) => BigInt(m.thinkMs)),
    ],
  });
}

export interface FinalizeInput {
  matchId: string;
  signerUserId: string;     // whoever triggered the end (resigner / mover delivering mate / accepter)
  status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
  resultReason: string;
  finalFen: string;
  pgn: string;
}

export async function finalizeMatchOnchain(input: FinalizeInput): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(input.signerUserId);
  return writeAndWait(client, {
    account,
    address: registryAddress(),
    functionName: 'finalize_match',
    args: [input.matchId, input.status, input.resultReason, input.finalFen, input.pgn],
  });
}

// ── reads via the service client (cheap, no signing) ──
export async function matchExistsOnchain(matchId: string): Promise<boolean> {
  return Boolean(await onchain().readContract({
    address: registryAddress(),
    functionName: 'match_exists',
    args: [matchId],
  }));
}
