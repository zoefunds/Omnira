import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '@omnira/db';
import { clientForUser } from './clientForUser.js';
import { registryAddress } from './client.js';
import {
  registerMatchOnchain,
  matchExistsOnchain,
  finalizeMatchOnchain,
} from './registry.js';
import { fundUserWallet } from './funding.js';

async function main() {
  // Use the two most recently created users as white/black.
  const recent = await prisma.user.findMany({
    take: 2,
    orderBy: { createdAt: 'desc' },
    include: { wallet: true },
  });
  if (recent.length < 2 || !recent[0]?.wallet || !recent[1]?.wallet) {
    throw new Error('need at least two users with wallets — sign up via the UI first');
  }
  const [white, black] = recent;
  console.log('white:', white.username, white.wallet!.address);
  console.log('black:', black.username, black.wallet!.address);

  // Top up white in case the auto-fund missed.
  console.log('topping up white…');
  const fundTx = await fundUserWallet(white.wallet!.address as `0x${string}`);
  console.log('fund tx:', fundTx ?? '(skipped/failed)');
  await sleep(8000);

  const matchId = `smoke-${randomUUID()}`;
  console.log('matchId:', matchId);
  console.log('registry:', registryAddress());

  console.log('before:', await matchExistsOnchain(matchId));

  console.log('registering as white…');
  const tx1 = await registerMatchOnchain({
    matchId,
    whitePlayerId: white.id,
    whiteAddress: white.wallet!.address as `0x${string}`,
    blackAddress: black.wallet!.address as `0x${string}`,
    initialMs: 300_000,
    incrementMs: 3000,
  });
  console.log('register tx:', tx1);
  console.log('after:', await matchExistsOnchain(matchId));

  console.log('finalizing as white…');
  const tx2 = await finalizeMatchOnchain({
    matchId,
    signerUserId: white.id,
    status: 'DRAW',
    resultReason: 'AGREEMENT',
    finalFen: '8/8/8/4k3/8/8/8/4K3 w - - 0 1',
    pgn: '*',
  });
  console.log('finalize tx:', tx2);
}

main().catch((e) => { console.error(e); process.exit(1); });
