# Rotating `WALLET_MASTER_SECRET`

Omnira derives each user's GenLayer wallet from `WALLET_MASTER_SECRET` + `userId` via HKDF (see `apps/api/src/wallet/derive.ts`). Bumping the master secret **changes every user's derived address**, breaking the "your wallet survives device changes" promise unless we migrate.

This document spells out the supported migration path. The short answer: **never rotate `WALLET_MASTER_SECRET` without bumping `WALLET_DERIVATION_VERSION` and running the migration**.

---

## When to rotate

Only rotate if you have a credible reason to believe the secret has leaked. Cosmetic rotations are net-negative — you create migration surface area without improving security.

If you suspect a leak:

1. **Stop new signups** by setting `MAINTENANCE=1` on the api service (TODO: not yet implemented — add a maintenance flag if/when this becomes a real concern).
2. **Snapshot the production database** before doing anything else.
3. Follow the migration below.

---

## The model

The `Wallet` row stores three fields relevant here:

```
address              0x…              -- the derived public address
derivationVersion    v1               -- WALLET_DERIVATION_VERSION at signup
```

`derivationVersion` is a copy of the env var at the time the wallet was minted. The api will refuse to fund or sign for a wallet whose `derivationVersion` doesn't match what `deriveWallet(userId)` produces — `apps/api/src/routes/wallet.ts` already enforces this with the `DERIVATION_MISMATCH` check on export.

This means a partial rotation (some users on v1, some on v2) is a valid steady state: every wallet keeps working as long as the server can re-derive its specific version's address.

---

## Migration plan

### Step 1 — pre-flight

Generate a new secret offline and choose a new version label:

```bash
NEW_SECRET=$(openssl rand -hex 64)
NEW_VERSION=v2
```

Keep `NEW_SECRET` somewhere safe (1Password / your password manager / a hardware token). **If you lose it, every v2 wallet is gone forever.**

### Step 2 — extend the deriver to support multiple versions

Today `apps/api/src/wallet/derive.ts` reads only the current env vars. Extend it so it can derive a wallet for **a specific version**:

```ts
// apps/api/src/wallet/derive.ts
const MASTER_SECRETS: Record<string, Buffer> = {
  v1: Buffer.from(process.env.WALLET_MASTER_SECRET_V1!, 'hex'),
  v2: Buffer.from(process.env.WALLET_MASTER_SECRET_V2!, 'hex'),
};

export async function deriveWalletForVersion(
  userId: string,
  version: string,
): Promise<DerivedWallet> {
  const ikm = MASTER_SECRETS[version];
  if (!ikm) throw new Error(`unknown derivation version ${version}`);
  // … same HKDF as before, but with the version-specific ikm
}

export async function deriveWallet(userId: string): Promise<DerivedWallet> {
  return deriveWalletForVersion(userId, env().WALLET_DERIVATION_VERSION);
}
```

Set BOTH `WALLET_MASTER_SECRET_V1` (= the old `WALLET_MASTER_SECRET` value) and `WALLET_MASTER_SECRET_V2` (= the new secret) on Railway. Set `WALLET_DERIVATION_VERSION=v2`.

After this, **new** signups get v2 wallets, **existing** users keep v1 wallets via their stored `derivationVersion`.

### Step 3 — backfill (only if you need to retire v1)

Most rotations don't require retiring the old version. If `v1` was leaked, however, you need to move every existing user off it:

```ts
// scripts/migrate-wallets.ts
const users = await prisma.wallet.findMany({
  where: { derivationVersion: 'v1' },
  select: { userId: true, address: true },
});

for (const w of users) {
  const v1 = await deriveWalletForVersion(w.userId, 'v1');
  const v2 = await deriveWalletForVersion(w.userId, 'v2');
  // 1) Send any onchain balance from v1 to v2 (the worker has v1's privateKey
  //    in memory because the env var is still present).
  await transferBalance(v1.privateKey, v2.address);
  // 2) Update the DB.
  await prisma.wallet.update({
    where: { userId: w.userId },
    data: { address: v2.address, derivationVersion: 'v2' },
  });
}
```

This is a **destructive** migration. You can roll back only by reading the old `address` from a snapshot. Take the snapshot in step 1.

### Step 4 — remove `WALLET_MASTER_SECRET_V1` from env

Once every wallet is on v2 (verify: `SELECT COUNT(*) FROM "Wallet" WHERE "derivationVersion" = 'v1'` returns 0), unset the v1 env var on Railway and redeploy. The deriver will throw on any subsequent call for an unknown version.

---

## What is NOT supported

- Rotating without bumping `WALLET_DERIVATION_VERSION`. The `Wallet.derivationVersion` column would become incorrect for every user and the export check would refuse to sign anything.
- Rotating mid-game. Drain in-flight matches first (api logs `aborted orphan matches on boot`).
- Re-using a prior `derivationVersion` label. Use a new string (`v3`, `v4`, …) so the deriver never has to disambiguate.

---

## Spot-check after rotation

For each version that's still in use:

```bash
# Pick any user with that version.
USER_ID=$(psql -At -c "SELECT \"userId\" FROM \"Wallet\" WHERE \"derivationVersion\" = 'v2' LIMIT 1")

# Verify their stored address matches what the deriver computes.
node -e "
  import('./apps/api/dist/wallet/derive.js').then(async ({ deriveWalletForVersion }) => {
    const w = await deriveWalletForVersion('$USER_ID', 'v2');
    console.log(w.address);
  });
"

psql -c "SELECT address FROM \"Wallet\" WHERE \"userId\" = '$USER_ID'"
```

Both addresses must match. If they diverge, **stop and investigate**.
