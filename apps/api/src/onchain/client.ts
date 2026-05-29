import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { env, onchainEnabled } from '../config/env.js';

let cached: ReturnType<typeof createClient> | null = null;

export function onchain() {
  if (!onchainEnabled()) {
    throw new Error(
      'onchain not configured: set GENLAYER_MATCH_REGISTRY_ADDRESS and GENLAYER_SERVICE_PRIVATE_KEY',
    );
  }
  if (cached) return cached;
  const e = env();
  const account = createAccount(e.GENLAYER_SERVICE_PRIVATE_KEY as `0x${string}`);
  cached = createClient({ chain: studionet, account });
  return cached;
}

export function serviceAccount() {
  return createAccount(env().GENLAYER_SERVICE_PRIVATE_KEY as `0x${string}`);
}

export function registryAddress(): `0x${string}` {
  return env().GENLAYER_MATCH_REGISTRY_ADDRESS as `0x${string}`;
}
