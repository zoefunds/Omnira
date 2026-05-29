import { randomUUID } from 'node:crypto';
import { serviceAccount } from './client.js';
import {
  registerMatchOnchain,
  matchExistsOnchain,
  finalizeMatchOnchain,
  getMoveCountOnchain,
} from './registry.js';

async function main() {
  const matchId = `omnira-smoke-${randomUUID()}`;
  console.log('service:', serviceAccount().address);
  console.log('matchId:', matchId);

  console.log('before:', await matchExistsOnchain(matchId));

  console.log('registering…');
  const tx1 = await registerMatchOnchain({
    matchId,
    whiteAddress: '0x1111111111111111111111111111111111111111',
    blackAddress: '0x2222222222222222222222222222222222222222',
    initialMs: 300_000,
    incrementMs: 3000,
  });
  console.log('register tx:', tx1);

  console.log('after register:', await matchExistsOnchain(matchId));
  console.log('move count:', await getMoveCountOnchain(matchId));

  console.log('finalizing…');
  const tx2 = await finalizeMatchOnchain({
    matchId,
    status: 'DRAW',
    resultReason: 'AGREEMENT',
    finalFen: '8/8/8/4k3/8/8/8/4K3 w - - 0 1',
    pgn: '*',
  });
  console.log('finalize tx:', tx2);
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
