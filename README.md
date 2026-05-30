# Omnira

**Onchain chess on GenLayer.** Realtime play, AI coaching via consensus, every move signed by the moving player's deterministic wallet.

[![phases](https://img.shields.io/badge/phases-13%2F13-2f6b4f)]()
[![tests](https://img.shields.io/badge/e2e-3%2F3-2f6b4f)]()

## What's in it

- ⚡ Realtime chess (Socket.IO, bullet → classical, click-to-move)
- 🏆 Arena tournaments with live standings + onchain finalization
- 🤖 Stockfish + GenLayer LLM Coach's notes via the `eq_principle.prompt_comparative` consensus
- 🧩 Auto-mined tactical puzzles from real blunders + Glicko-lite puzzle rating
- 👁 Spectator mode for any live game
- 🔐 Deterministic permanent wallets — survive device changes and cache clears
- 📡 Three Intelligent Contracts: `MatchRegistry`, `AnalysisOracle`, `TournamentRegistry`

## Stack

`apps/web` Next.js 14 · `apps/api` Fastify + Socket.IO · `apps/worker` Stockfish + GenLayer LLM
`packages/chess-engine` chess.js wrapper + clocks · `packages/db` Prisma
`contracts/genlayer` Python Intelligent Contracts · `tests/e2e` Playwright

## Get running locally

```bash
pnpm install
cp .env.example .env && $EDITOR .env      # see docs/SECURITY_CHECKLIST.md for what each var means
pnpm --filter @omnira/db run migrate:dev
pnpm --filter @omnira/api dev    # tab 1
pnpm --filter @omnira/worker dev # tab 2
pnpm --filter @omnira/web dev    # tab 3
# tests
pnpm --filter @omnira/e2e test
Deploy
See infrastructure/README.md.

Security / contract redeploys
docs/SECURITY_CHECKLIST.md
docs/CONTRACT_REDEPLOY.md
