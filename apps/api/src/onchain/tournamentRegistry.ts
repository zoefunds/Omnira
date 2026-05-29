import { TransactionStatus, CalldataAddress } from 'genlayer-js/types';
import { onchain, registryAddress } from './client.js';
import { clientForUser } from './clientForUser.js';
import { env } from '../config/env.js';

function tournamentRegistryAddress(): `0x${string}` {
  const a = (env() as any).GENLAYER_TOURNAMENT_REGISTRY_ADDRESS as string | undefined;
  if (!a) throw new Error('GENLAYER_TOURNAMENT_REGISTRY_ADDRESS not set');
  return a as `0x${string}`;
}

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

export interface RegisterTournamentInput {
  tournamentId: string;
  hostUserId: string;
  hostAddress: `0x${string}`;
  name: string;
  initialMs: number;
  incrementMs: number;
  startsAtSec: number;
  durationMs: number;
}

export async function registerTournamentOnchain(input: RegisterTournamentInput): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(input.hostUserId);
  return writeAndWait(client, {
    account,
    address: tournamentRegistryAddress(),
    functionName: 'register_tournament',
    args: [
      input.tournamentId,
      addr(input.hostAddress),
      input.name,
      BigInt(input.initialMs),
      BigInt(input.incrementMs),
      BigInt(input.startsAtSec),
      BigInt(input.durationMs),
    ],
  });
}

export interface FinalizeTournamentEntry {
  rank: number;
  playerAddress: `0x${string}`;
  score: number;
  wins: number;
  losses: number;
  draws: number;
}

export async function finalizeTournamentOnchain(
  tournamentId: string,
  hostUserId: string,
  standings: FinalizeTournamentEntry[],
): Promise<`0x${string}`> {
  const { client, account } = await clientForUser(hostUserId);
  return writeAndWait(client, {
    account,
    address: tournamentRegistryAddress(),
    functionName: 'finalize_tournament',
    args: [
      tournamentId,
      standings.map((s) => BigInt(s.rank)),
      standings.map((s) => addr(s.playerAddress)),
      standings.map((s) => BigInt(s.score)),
      standings.map((s) => BigInt(s.wins)),
      standings.map((s) => BigInt(s.losses)),
      standings.map((s) => BigInt(s.draws)),
    ],
  });
}
