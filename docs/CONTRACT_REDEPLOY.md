# Omnira — contract redeploy / migration playbook

Every Intelligent Contract on the platform has been deployed at least twice
during development. This is the runbook for doing it cleanly in production
without losing the chain history users care about.

## Three contracts

| Address env var                            | Contract            | Purpose                              |
|--------------------------------------------|---------------------|--------------------------------------|
| `GENLAYER_MATCH_REGISTRY_ADDRESS`          | `MatchRegistry`     | Per-game record (register / batches / finalize) |
| `GENLAYER_ANALYSIS_ORACLE_ADDRESS`         | `AnalysisOracle`    | GenLayer LLM coaching reports        |
| `GENLAYER_TOURNAMENT_REGISTRY_ADDRESS`     | `TournamentRegistry`| Per-tournament record + final standings |

Source files live in `contracts/genlayer/`.

## When to redeploy

- Schema change in storage (add a field, change a TreeMap shape).
- Logic bug fix that can't be patched off-chain.
- Calldata format change (rare — affects backward compat).

## Important property: **chain records are forward-only**

Existing match records on the old contract address remain readable forever via
that address. The old contract is never "deleted". Redeploy = mint a new
address; new matches go there; old matches keep being read from the old one.

## Procedure

1. **Edit the contract** under `contracts/genlayer/` and run any unit tests you have.
2. **Deploy via GenLayer Studio UI** (or `genlayer deploy ...` if you've configured the CLI).
3. **Copy the new address.**
4. **Backup current `.env`** before editing:
   ```bash
   sudo -u omnira cp /srv/omnira/.env /srv/omnira/.env.bak.$(date +%s)
Update the relevant env var in /srv/omnira/.env. Example for the analysis oracle:
GENLAYER_ANALYSIS_ORACLE_ADDRESS=0xNEW_ADDRESS
Restart only the services that talk to that contract:
MatchRegistry → omnira-api and omnira-worker
AnalysisOracle → omnira-worker only
TournamentRegistry → omnira-api only
sudo systemctl restart omnira-api omnira-worker
Smoke the new path. Examples:
MatchRegistry: play a game in two browsers, watch api logs for register: ok with the new address.
AnalysisOracle: finish a game with ≥ 10 plies, watch worker logs for LLM analysis stored.
TournamentRegistry: create + finish a 5-minute arena, watch api logs for tournament/onchain registered and finalized.
Backward compat — reading old records
In-app data is mirrored in Postgres (Match, Move, Tournament, AnalysisReport), so end users never notice the chain split. If you need to programmatically read old chain records from before a redeploy, you can:

import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
const client = createClient({ chain: studionet, account });
await client.readContract({
  address: '0xOLD_REGISTRY_ADDRESS',
  functionName: 'get_match',
  args: ['<matchId>'],
});
Only the address differs.

Aborting a redeploy
Restore .env from the backup, restart services. The old contract is untouched on chain.

Player-signed migration concerns
Player wallets are derived from WALLET_MASTER_SECRET + userId and are stable across contract redeploys. A new MatchRegistry contract still recognizes them; you don't need to "migrate" users.

The single change-anything secret is WALLET_MASTER_SECRET. If that's ever rotated:

All users' wallets change.
Old chain records remain authentic but the addresses inside them no longer correspond to anyone's current wallet.
Effectively a hard fork of identity. Never rotate this secret without a coordinated user-facing migration plan.
