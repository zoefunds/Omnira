import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deriveWallet, deriveAddress } from './derive.js';
import { __resetEnvCache } from '../config/env.js';

beforeAll(() => {
  if (!process.env.WALLET_MASTER_SECRET) {
    throw new Error('WALLET_MASTER_SECRET missing — run via `pnpm --filter @omnira/api test`');
  }
});

describe('deriveWallet', () => {
  it('produces a deterministic address for the same userId', async () => {
    const userId = randomUUID();
    const a = await deriveWallet(userId);
    const b = await deriveWallet(userId);
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('produces different addresses for different users', async () => {
    const a = await deriveAddress(randomUUID());
    const b = await deriveAddress(randomUUID());
    expect(a).not.toBe(b);
  });

  it('produces a 0x-prefixed 20-byte address', async () => {
    const a = await deriveAddress(randomUUID());
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns the configured derivation version', async () => {
    const w = await deriveWallet(randomUUID());
    expect(w.derivationVersion).toBe(process.env.WALLET_DERIVATION_VERSION ?? 'v1');
  });

  it('changing version changes the address for the same user', async () => {
    const userId = randomUUID();
    const original = process.env.WALLET_DERIVATION_VERSION;

    process.env.WALLET_DERIVATION_VERSION = 'v1';
    __resetEnvCache();
    const v1 = await deriveAddress(userId);

    process.env.WALLET_DERIVATION_VERSION = 'v2-test';
    __resetEnvCache();
    const v2 = await deriveAddress(userId);

    process.env.WALLET_DERIVATION_VERSION = original;
    __resetEnvCache();
    expect(v1).not.toBe(v2);
  });
});
