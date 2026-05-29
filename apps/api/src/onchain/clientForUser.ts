import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { deriveWallet } from '../wallet/derive.js';

/**
 * Build a GenLayer client signed by a specific user's deterministic wallet.
 * The private key is re-derived in memory and never persisted.
 */
export async function clientForUser(userId: string) {
  const w = await deriveWallet(userId);
  const account = createAccount(w.privateKey);
  const client = createClient({ chain: studionet, account });
  return { client, account, address: w.address };
}
