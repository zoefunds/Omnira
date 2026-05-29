import { TransactionStatus, CalldataAddress } from 'genlayer-js/types';
import { onchain, registryAddress, serviceAccount } from './client.js';
import { clientForUser } from './clientForUser.js';

function addr(hex: string): CalldataAddress {
  const clean = hex.toLowerCase().replace(/^0x/, '');
  if (clean.length !== 40) throw new Error(`bad address: ${hex}`);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new CalldataAddress(bytes);
}

async function writeAndWaitWith(
  client: ReturnType<typeof onchain>,
  args: Parameters<ReturnType<typeof onchain>['writeContract']>[0],
): Promise<`0x${string}`> {
  const hash = (await client.writeContract(args)) as `0x${string}`;
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
  return hash;
}

export interface RegisterMatchInput {
  matchId: string;
  whitePlayerId: string;     // signs the tx
  whiteAddress: `0x${string}`;
  blackAddress: `0x${string}`;
  initialMs: number;
  incrementMs: number;
}

export async function registerMatchOnchain(input: RegisterMatchInput): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(input.whitePlayerId);
  return writeAndWaitWith(client, {
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

export async function submitMovesBatchOnchain(
  matchId: string,
  whitePlayerId: string,
  batch: MoveBatchEntry[],
): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(whitePlayerId);
  return writeAndWaitWith(client, {
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
  whitePlayerId: string;
  status: 'WHITE_WON' | 'BLACK_WON' | 'DRAW' | 'ABORTED';
  resultReason: string;
  finalFen: string;
  pgn: string;
}

export async function finalizeMatchOnchain(input: FinalizeInput): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(input.whitePlayerId);
  return writeAndWaitWith(client, {
    account,
    address: registryAddress(),
    functionName: 'finalize_match',
    args: [input.matchId, input.status, input.resultReason, input.finalFen, input.pgn],
  });
}

// ── reads remain via the service client (cheaper, no signing) ──

export async function matchExistsOnchain(matchId: string): Promise<boolean> {
  const c = onchain();
  return Boolean(await c.readContract({
    address: registryAddress(),
    functionName: 'match_exists',
    args: [matchId],
  }));
}

export async function getMoveCountOnchain(matchId: string): Promise<number> {
  const c = onchain();
  return Number(await c.readContract({
    address: registryAddress(),
    functionName: 'get_move_count',
    args: [matchId],
  }));
}

// Keep serviceAccount export usable elsewhere (e.g., funding)
export { serviceAccount };
