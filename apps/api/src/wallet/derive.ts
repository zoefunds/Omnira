import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { env } from '../config/env.js';

const hkdfAsync = promisify(hkdf);

// secp256k1 group order. Private key must be in [1, n-1].
const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`invalid uuid: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): Hex {
  return ('0x' + Buffer.from(bytes).toString('hex')) as Hex;
}

export interface DerivedWallet {
  address: Address;
  derivationVersion: string;
  // privateKey is returned ONLY for in-process signing — never persist, never log.
  privateKey: Hex;
}

/**
 * Deterministically derive a GenLayer/EVM wallet for a user.
 *
 * Same (masterSecret, userId, version) → same address, always.
 * This is what makes the wallet survive device changes and cache clears:
 * the only persistent input is `userId` (in the DB) — everything else
 * lives in env vars on the server.
 */
export async function deriveWallet(userId: string): Promise<DerivedWallet> {
  const { WALLET_MASTER_SECRET, WALLET_DERIVATION_VERSION } = env();

  const ikm = Buffer.from(WALLET_MASTER_SECRET, 'hex');
  if (ikm.length < 32) {
    throw new Error('WALLET_MASTER_SECRET must decode to ≥ 32 bytes');
  }
  const salt = uuidToBytes(userId);
  const info = Buffer.from(`omnira/genlayer/wallet/${WALLET_DERIVATION_VERSION}`, 'utf8');

  // Counter lets us reject and retry if the derived scalar is ≥ n (astronomically rare).
  for (let counter = 0; counter < 256; counter++) {
    const infoWithCounter = Buffer.concat([info, Buffer.from([counter])]);
    const seedBuffer = (await hkdfAsync('sha256', ikm, salt, infoWithCounter, 32)) as ArrayBuffer;
    const seed = new Uint8Array(seedBuffer);

    const asBigInt = BigInt('0x' + Buffer.from(seed).toString('hex'));
    if (asBigInt === 0n || asBigInt >= SECP256K1_N) continue;

    const privateKey = bytesToHex(seed);
    const account = privateKeyToAccount(privateKey);
    return {
      address: account.address,
      derivationVersion: WALLET_DERIVATION_VERSION,
      privateKey,
    };
  }
  throw new Error('failed to derive valid secp256k1 key after 256 attempts (impossible)');
}

/** Convenience for places that should never see the private key. */
export async function deriveAddress(userId: string): Promise<Address> {
  const w = await deriveWallet(userId);
  return w.address;
}
