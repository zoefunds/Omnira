<div align="center">

# ♛ Omnira

**Onchain chess on GenLayer.** Real-time play, AI coaching via consensus, every move signed by the moving player's deterministic wallet.

[**Live →**](https://omnira-blond.vercel.app) · [API](https://omnira-api-production.up.railway.app/health) · [Repo](https://github.com/zoefunds/Omnira)

![status](https://img.shields.io/badge/status-live-b8901f) ![web](https://img.shields.io/badge/web-Vercel-000) ![api](https://img.shields.io/badge/api-Railway-7B61FF) ![db](https://img.shields.io/badge/db-Postgres-336791) ![cache](https://img.shields.io/badge/cache-Redis-DC382D) ![consensus](https://img.shields.io/badge/onchain-GenLayer-b8901f)

</div>

---

## Table of contents

- [What it is](#what-it-is)
- [Feature tour](#feature-tour)
- [Architecture](#architecture)
- [Repo layout](#repo-layout)
- [Tech stack](#tech-stack)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Intelligent Contracts](#intelligent-contracts)
- [Realtime protocol](#realtime-protocol)
- [Rating system](#rating-system)
- [AI coaching pipeline](#ai-coaching-pipeline)
- [Deployment](#deployment)
- [Email (password reset)](#email-password-reset)
- [Operations cheatsheet](#operations-cheatsheet)
- [Security notes](#security-notes)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Credits](#credits)

---

## What it is

Omnira is a chess platform that uses **GenLayer Intelligent Contracts** as the source of truth for game outcomes and tournament results. Players hold a deterministic self-custody wallet (no extension needed) that is derived from a server master secret + their account UUID, so wallets travel with the user across devices.

Three things make Omnira different from a generic chess site:

1. **Every finished match is committed onchain** to a `MatchRegistry` Intelligent Contract on GenLayer Studio Net, with the winner's signature.
2. **Coaching analyses are consensus-validated**. After a match the worker runs Stockfish + asks the GenLayer LLM for a written breakdown; the answer is signed by N validators via the `eq_principle.prompt_comparative` equivalence principle before it lands in your "AI Coaching Archive".
3. **Self-custody by default, zero friction.** A 32-byte BIP-32-style derivation gives every signup a unique GenLayer address. No seed phrases, no extension, no MetaMask popups.

---

## Feature tour

| Area | What's there |
|---|---|
| **Play** | Bullet / Blitz / Rapid / Classical; pool matchmaking; private invite links; click-to-move with legal-target highlighting; live clocks tick-accurate to ±50 ms |
| **Tournaments** | Lichess-style arena (continuous pairing); UTC start times; rated/casual; auto-finalised onchain at end-of-window |
| **Spectator** | Watch any active game; auto-refreshing grid filtered by time control |
| **Puzzles** | Auto-mined from real blunders in finished games; Glicko-lite rating; themes (fork, pin, etc.); skip + grade flow |
| **Profile** | Rating cards with sparklines per category; activity heatmap (52 weeks); recent games; trophy room; full AI coaching modal per game |
| **AI Coaching Archive** | Each finished match yields one LLM-written report on your opening, middlegame, endgame, and a tactical highlight, validated via GenLayer consensus |
| **Anti-cheat** | Worker computes per-side avg cp loss + top-match % vs Stockfish; `SuspicionFlag` rows surface to a moderator queue |
| **Auth** | Email + password (argon2id), JWT with refresh sessions, lockout after repeated failures, password reset email via Brevo |
| **Settings** | Language (en/es/fr/de) live-switches the surface; board palette (Classic / Walnut / Marble) writes CSS vars consumed by every board; piece set; per-user avatar upload (local) |
| **Mobile** | Responsive nav drawer, horizontal-scroll setting tabs, board fills viewport, modals viewport-safe |

---

## Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │  Vercel  (Next.js 14, parchment UI)          │
                  │  apps/web                                    │
                  └──────────────┬───────────────────────────────┘
                                 │ HTTPS + WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Railway                                                                │
│                                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  omnira-api         │    │  omnira-worker      │                     │
│  │  Fastify+Socket.IO  │◀──▶│  Stockfish + LLM    │                     │
│  │  apps/api           │    │  apps/worker        │                     │
│  └──────────┬──────────┘    └──────────┬──────────┘                     │
│             │                          │                                │
│             ▼                          ▼                                │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │  Postgres           │    │  Redis              │                     │
│  │  (Prisma)           │    │  (sessions/queues)  │                     │
│  └─────────────────────┘    └─────────────────────┘                     │
└─────────────────────────────────────────────┬───────────────────────────┘
                                              │ writeContract
                                              ▼
                              ┌──────────────────────────────────┐
                              │  GenLayer Studio Net             │
                              │  MatchRegistry                   │
                              │  AnalysisOracle                  │
                              │  TournamentRegistry              │
                              └──────────────────────────────────┘
```

- **`apps/web`** — Next.js 14 (App Router), client-side state via Zustand, real-time via socket.io-client. Deployed to Vercel.
- **`apps/api`** — Fastify + Socket.IO, owns auth, matchmaking, REST endpoints, and signed onchain writes on game-end. Long-lived WS forces it onto Railway rather than Vercel functions.
- **`apps/worker`** — Pulls finished matches off Redis, runs Stockfish per ply, asks the GenLayer Coach contract for an LLM analysis, writes the result back to Postgres and onchain. Also drives the suspicion-flag heuristic.

---

## Repo layout

```
omnira/
├── apps/
│   ├── web/                 # Next.js frontend (Vercel)
│   ├── api/                 # Fastify + Socket.IO REST + WS (Railway)
│   └── worker/              # Stockfish + GenLayer LLM (Railway)
├── packages/
│   ├── chess-engine/        # chess.js wrapper, clocks, move legality
│   ├── db/                  # Prisma schema + client
│   ├── config/              # shared tsconfig + tooling
│   ├── shared/              # cross-app types & constants
│   └── ui/                  # design tokens (unused for now)
├── contracts/
│   └── genlayer/            # Python Intelligent Contracts (Match, Analysis, Tournament)
├── tests/
│   └── e2e/                 # Playwright end-to-end suite
├── docs/                    # SECURITY_CHECKLIST, CONTRACT_REDEPLOY, DEPLOY_VERCEL_RAILWAY
├── infrastructure/          # nginx + systemd templates for single-VPS deploy
├── railpack.api.json        # Railway/Railpack build config — api service
├── railpack.worker.json     # Railway/Railpack build config — worker service
├── nixpacks.toml            # Fallback Nixpacks config (node 20, pnpm 9, stockfish apt)
└── vercel.json              # apps/web rootDir + pnpm install/build for monorepo
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS, Zustand, react-chessboard, chess.js, lucide-react, Cormorant Garamond + Inter |
| Realtime | Socket.IO 4 (client + server) |
| Backend  | Fastify 5, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/helmet`, Zod for validation |
| Worker   | Native Stockfish 15 (apt package), genlayer-js, chess.js |
| Onchain  | GenLayer JS SDK, three Intelligent Contracts in Python on Studio Net |
| Storage  | Postgres 15 (Prisma 5), Redis 7 (sessions + worker queue) |
| Auth     | argon2id, JWT + refresh, sessions, rate-limited login |
| Email    | Brevo (Sendinblue) transactional API for password reset |
| Build    | pnpm 9 workspaces, Turbo (dev), TypeScript 5, Railpack 0.24, esbuild via vite/vitest |
| Tests    | Vitest unit suite, Playwright e2e suite |
| Hosting  | Vercel (web), Railway (api + worker + Postgres + Redis) |

---

## Run locally

### Prerequisites

- Node 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Postgres 15 (Docker `postgres:15` works fine)
- Redis 7 (Docker `redis:7` works fine)
- Stockfish: `brew install stockfish` (macOS) · `apt install stockfish` (Linux)

### One-time setup

```bash
git clone https://github.com/zoefunds/Omnira.git
cd Omnira
pnpm install
cp .env.example .env
# generate secrets and paste into .env
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 64   # → WALLET_MASTER_SECRET
openssl rand -hex 32   # → ADMIN_TOKEN

# bring up DB + Redis (or use your own)
docker run -d --name pg -e POSTGRES_USER=omnira -e POSTGRES_PASSWORD=omnira -p 5432:5432 postgres:15
docker run -d --name redis -p 6379:6379 redis:7

# apply migrations + generate prisma client
pnpm --filter @omnira/db migrate:dev
```

### Run the three services (separate terminals)

```bash
pnpm --filter @omnira/api dev      # http://localhost:4000
pnpm --filter @omnira/worker dev   # background
pnpm --filter @omnira/web dev      # http://localhost:3000
```

Open http://localhost:3000, sign up, play a game against yourself in two tabs.

### Useful one-offs

```bash
pnpm typecheck                                  # type-check the whole monorepo
pnpm --filter @omnira/api test                  # vitest unit tests
pnpm --filter @omnira/e2e test                  # playwright e2e (requires app running)
pnpm --filter @omnira/db studio                 # prisma studio at :5555
pnpm --filter @omnira/db migrate:reset --force  # nuke local DB
```

---

## Environment variables

All env vars are validated at api boot via Zod (`apps/api/src/config/env.ts`). Missing required vars crash the process.

### Required

| Var | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:port/dbname` |
| `REDIS_URL` | `redis://[user:pass@]host:port` |
| `JWT_SECRET` | 64+ hex bytes. `openssl rand -hex 64`. |
| `WALLET_MASTER_SECRET` | 64+ hex bytes. **CRITICAL** — if leaked, every user's wallet is compromised; if lost, every user loses access to theirs. Back this up offline. |
| `WALLET_DERIVATION_VERSION` | Bump if you ever rotate `WALLET_MASTER_SECRET`. Default `v1`. |
| `GENLAYER_RPC_URL` | `https://studio.genlayer.com/api` |
| `STOCKFISH_PATH` | Worker: path to the binary. Linux apt installs to `/usr/games/stockfish`. |

### Optional

| Var | Used by | Notes |
|---|---|---|
| `API_PORT` | api | Defaults to 4000. On Railway, set this equal to `$PORT`. |
| `JWT_TTL` | api | Access token lifetime. Default `7d`. |
| `GENLAYER_MATCH_REGISTRY_ADDRESS` | api + worker | Filled in after you deploy the Match contract. |
| `GENLAYER_ANALYSIS_ORACLE_ADDRESS` | worker | Coach contract address. |
| `GENLAYER_TOURNAMENT_REGISTRY_ADDRESS` | api | Tournament finalisation contract. |
| `GENLAYER_SERVICE_PRIVATE_KEY` | api + worker | 32-byte hex private key that funds the service wallet. Required to write onchain. |
| `ADMIN_TOKEN` | api | Bearer token for `/admin/*` routes (suspicion flag review). |
| `ANALYSIS_DEPTH` | worker | Stockfish depth per ply. Default 12. |
| `ANALYSIS_POLL_MS` | worker | Queue poll interval. Default 3000. |
| `BREVO_API_KEY` | api | Transactional email key. Without it, the password-reset endpoint logs the email to stdout instead of sending. |
| `EMAIL_FROM` | api | `Name <email>`. The address must be **verified as a sender** in Brevo. |
| `WEB_BASE_URL` | api | Used to build reset-password links in emails. |

---

## Database & migrations

Schema lives in `packages/db/prisma/schema.prisma`. Core models:

- `User`, `Wallet`, `Session`, `Rating`, `PasswordResetToken`
- `Match`, `Move`, `MatchAnalysis`, `ChatMessage`, `Challenge`, `Alternative`
- `Tournament`, `TournamentPlayer`
- `Puzzle`, `PuzzleAttempt`, `PuzzleRating`
- `SuspicionFlag`

Commands:

```bash
# create a migration from a schema change
pnpm --filter @omnira/db exec prisma migrate dev --name describe_the_change

# apply pending migrations to a remote DB (CI/prod)
DATABASE_URL=$PROD_DB pnpm --filter @omnira/db exec prisma migrate deploy

# wipe + re-apply all migrations to a clean DB
DATABASE_URL=$PROD_DB pnpm --filter @omnira/db exec prisma migrate reset --force --skip-seed
```

---

## Intelligent Contracts

In `contracts/genlayer/`:

| Contract | Purpose |
|---|---|
| `MatchRegistry`   | `startMatch`, `submitMove`, `finalizeMatch` — the on-chain record of every game and result |
| `AnalysisOracle`  | Receives PGN + Stockfish lines, returns LLM-coached analysis via `eq_principle.prompt_comparative` consensus |
| `TournamentRegistry` | Creates arenas, records standings, settles winners |

Redeploy procedure: see [`docs/CONTRACT_REDEPLOY.md`](docs/CONTRACT_REDEPLOY.md). Quick version: deploy the new contract address, paste it into the matching env var on Railway, redeploy api + worker.

---

## Realtime protocol

The api exposes a Socket.IO endpoint on the same port as REST. Auth happens via JWT in the connection query.

| Event | Direction | Payload |
|---|---|---|
| `queue:join` | client → server | `{ category, initialMs, incrementMs }` |
| `match:start` | server → client | `{ matchId, whitePlayerId, blackPlayerId, fen, initialMs, incrementMs }` |
| `match:move`  | client → server | `{ matchId, uci }` |
| `match:move`  | server → client | `{ ply, san, uci, fenAfter, whiteMs, blackMs, turn }` |
| `match:end`   | server → client | `{ outcome, reason }` |
| `match:offerDraw` / `match:acceptDraw` / `match:resign` | client → server | `{ matchId }` |
| `match:drawOffer` | server → client | `{ matchId, from }` |
| `chat:send` / `chat:msg` | both | `{ matchId, body }` |

Clocks are server-authoritative. The frontend renders countdowns from `clockTickFrom` deltas, sync'd on every `match:move`.

---

## Rating system

Standard Elo, K=40 while provisional (<30 games), K=32 normally, K=16 over 2400. Implemented in `apps/api/src/rating/elo.ts`. Updates run inside the same transaction that finalises a match, so a rating change is atomic with the result.

```ts
const elo = applyElo(
  { rating: room.whiteRatingBefore, gamesPlayed: 0 },
  { rating: room.blackRatingBefore, gamesPlayed: 0 },
  outcome,
);
```

Puzzles use a Glicko-lite update (`apps/api/src/puzzles/glicko.ts`) so streaks and rating volatility behave correctly.

---

## AI coaching pipeline

```
finalize(match)
  └─→ enqueue('match:finalize', { matchId, pgn, finalFen })
       └─→ worker pulls from Redis
            ├─→ Stockfish per ply at depth 12
            ├─→ build SAN/UCI/cp diff per move
            ├─→ writeContract(AnalysisOracle.coach, { pgn, lines })
            │     └─→ GenLayer Studio → 5 validators run the LLM prompt
            │          └─→ eq_principle.prompt_comparative picks consensus
            ├─→ persist MatchAnalysis { llmSummary, cpLossWhite, cpLossBlack, themes }
            └─→ if avgCpLoss < threshold AND topMovePct > threshold
                  └─→ SuspicionFlag row for moderator review
```

The flagged user sees the coaching summary in their **AI Coaching Archive** (profile page) and can open the full report modal.

---

## Deployment

The hybrid topology is:

- **Frontend** → Vercel (Next.js)
- **Backend** → Railway (api + worker + Postgres + Redis), because Socket.IO needs long-lived connections incompatible with Vercel serverless

See [`docs/DEPLOY_VERCEL_RAILWAY.md`](docs/DEPLOY_VERCEL_RAILWAY.md) for the full first-time recipe.

### Quick redeploy after a code change

```bash
git push                                        # triggers Vercel build automatically

cd /Users/macbook/omnira
railway link --service omnira-api    && railway up --ci
railway link --service omnira-worker && railway up --ci
```

### Single-VPS alternative

`infrastructure/` ships nginx + systemd templates if you'd rather run everything on one box.

---

## Email (password reset)

The reset flow:

1. `POST /auth/forgot-password { email }` →
   - Always returns `{ ok:true, message:'…' }` (no enumeration leak)
   - If the email matches a user: mint 32-byte random token, store sha256 hash with 30-min TTL, send email via Brevo
2. User clicks email link → opens `/reset?token=…`
3. `POST /auth/reset-password { token, newPassword }` →
   - sha256 the token, look up, check unused + unexpired
   - Atomically update password hash + mark token used
   - Revoke all sessions for the user

Set `BREVO_API_KEY` to enable real send. Without it, the api logs the email payload to stdout — useful in dev.

Sender requirements:
- Verify your sender address in Brevo (Senders → Add a Sender → click confirmation link)
- Disable IP authorisation in Brevo (Security → Authorised IPs → off) — Railway IPs aren't static
- For production, verify a domain you own and use `noreply@yourdomain.com`

---

## Operations cheatsheet

```bash
# health
curl https://omnira-api-production.up.railway.app/health | jq
curl https://omnira-api-production.up.railway.app/health/ready | jq    # incl. Postgres + Redis ping

# logs (Railway)
railway link --service omnira-api    && railway logs --tail 100
railway link --service omnira-worker && railway logs --tail 100
railway link --service omnira-api    && railway logs --build | tail -50

# variables (Railway)
railway variables                                # list
railway variables --set "FOO=bar"                # set
railway variables --unset FOO                    # remove

# wipe production DB (destructive)
PROD_DB=$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
DATABASE_URL="$PROD_DB" pnpm --filter @omnira/db exec prisma migrate reset --force --skip-seed

# force a redeploy without changing code
railway link --service omnira-api && railway redeploy -y

# Vercel
vercel deploy --prod
vercel env add NEXT_PUBLIC_API_BASE production    # interactive
vercel logs <deployment-url> --since 10m
```

---

## Security notes

- `WALLET_MASTER_SECRET` — single most important value. Back up offline. If you must rotate, bump `WALLET_DERIVATION_VERSION` and migrate users (see `docs/SECURITY_CHECKLIST.md`).
- `GENLAYER_SERVICE_PRIVATE_KEY` — funds the service wallet that signs onchain writes. Keep this in Railway vars only, never in git.
- Password hashing: argon2id with sensible defaults; runtime cost picked by the `argon2` library.
- Session tokens: JWT (HS256) for access, opaque random refresh tokens stored as sha256 hashes in `Session`. Logout revokes the session row; logout-all wipes every session for the user.
- Lockout: 5 failures in 15 min per identifier triggers a 15-min lock.
- CORS: `origin: true, credentials: true` — only the Omnira web origin should set credentials in practice.
- Rate-limits: 10/min on auth routes, 5/15min on `/auth/forgot-password`, defaults elsewhere.
- Helmet + JSON body limits applied by Fastify.

---

## Testing

```bash
# unit
pnpm --filter @omnira/api test
pnpm --filter @omnira/chess-engine test
pnpm --filter @omnira/worker test

# e2e (requires API + web running locally)
pnpm --filter @omnira/e2e test
```

The Playwright suite covers signup → matchmaking → play → finalize → onchain settlement → analysis appears in the profile.

---

## Roadmap

- [ ] Real password-reset email **(done — Brevo)**
- [ ] Profile-picture upload to object storage instead of localStorage (Cloudinary or R2)
- [ ] WebPush notifications for tournament starts
- [ ] iOS/Android wrappers (Capacitor)
- [ ] Lichess-style FIDE rating import
- [ ] Hot-seat / pass-and-play mode
- [ ] Postgame engine variation tree (multi-PV)
- [ ] Two-factor authentication (TOTP)
- [ ] OAuth (Apple / Google) signup

---

## Credits

- **Stockfish** — open-source UCI engine
- **chess.js** — JS chess library by Jeff Hlywa
- **react-chessboard** — Clariity's React board component
- **GenLayer Studio** — Intelligent Contracts platform powering consensus-validated AI
- **Brevo** — transactional email provider
- **Vercel** + **Railway** — hosting that doesn't make you cry
- **Lichess** — design inspiration for the arena format

Built with ♛ on parchment.
