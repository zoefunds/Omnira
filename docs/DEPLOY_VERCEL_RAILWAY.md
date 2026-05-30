# Omnira — hybrid deploy (Vercel + Railway)

Recommended for the easiest path to "live on the internet" without managing servers.

## Topology
                ┌──────────────────┐
omnira.app ───▶ │ Vercel: web │ Next.js (SSR + static)
└──────┬───────────┘
│ fetch + WS (NEXT_PUBLIC_API_BASE)
▼
┌──────────────────┐
api.omnira.app ─▶ │ Railway: api │ Fastify + Socket.IO
└──────┬───────────┘
│
┌──────┴───────────┐
│ Railway: worker │ Stockfish + GenLayer LLM polling
└──────────────────┘
│
┌──────────────┼──────────────┐
▼ ▼ ▼
Neon Postgres Upstash Redis GenLayer Studio Net

Why not all-Vercel: Socket.IO needs a long-lived WebSocket; the worker needs a persistent Stockfish child process and timers. Vercel serverless can't do either.
## 1. Database — Neon (Postgres)
1. Sign in at neon.tech, create a project named `omnira`.
2. Copy the **pooled connection string** (looks like `postgres://user:pass@...neon.tech/omnira?sslmode=require`).
3. Save it; you'll paste it as `DATABASE_URL` in **both Railway services** below.
4. Run the initial migration from your laptop (one-time):
   ```bash
   DATABASE_URL='postgres://...neon.tech/omnira?sslmode=require' \
     pnpm --filter @omnira/db run migrate:deploy
2. Redis — Upstash
Sign in at upstash.com, create a Redis database in the same region as your Railway services.
Copy the redis:// URL with TLS (typically rediss://...).
Save it as REDIS_URL.
3. Backend (api + worker) — Railway
Railway runs any Dockerfile-less Node app from a GitHub repo. One project, two services pointed at the same monorepo with different start commands.

3.1 Create the project
Sign in at railway.app, click New Project → Deploy from GitHub repo, select zoefunds/Omnira.
It'll detect the monorepo and propose one service. We'll customize it.
3.2 The api service
Build command:
pnpm install --frozen-lockfile && pnpm --filter @omnira/db generate && pnpm --filter @omnira/api build
Start command:
node --enable-source-maps apps/api/dist/server.js
Watch paths: apps/api/**, packages/**, pnpm-lock.yaml
Environment variables (copy from your .env):
NODE_ENV=production
API_PORT=4000
DATABASE_URL (Neon pooled URL)
REDIS_URL (Upstash rediss:// URL)
JWT_SECRET, WALLET_MASTER_SECRET, ADMIN_TOKEN (generate fresh with openssl rand -hex 64)
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_MATCH_REGISTRY_ADDRESS, GENLAYER_ANALYSIS_ORACLE_ADDRESS, GENLAYER_TOURNAMENT_REGISTRY_ADDRESS
GENLAYER_SERVICE_PRIVATE_KEY
WALLET_DERIVATION_VERSION=v1
JWT_TTL=7d
Networking: enable public networking. Railway will assign a URL like omnira-api-production.up.railway.app. Copy it.
Custom domain (optional): point api.omnira.app at it in your DNS.
3.3 The worker service
In the same Railway project, + New → Empty Service, then point it at the same GitHub repo.

Install Stockfish: Railway uses Nixpacks. Drop a nixpacks.toml at the repo root (one-time):
[phases.setup]
aptPkgs = ["stockfish"]
nixPkgs = ["nodejs_20", "pnpm-9_x"]
Build command:
pnpm install --frozen-lockfile && pnpm --filter @omnira/db generate && pnpm --filter @omnira/worker build
Start command:
node --enable-source-maps apps/worker/dist/index.js
Environment variables: same as the api service, plus:
STOCKFISH_PATH=/usr/games/stockfish
No public networking — worker doesn't expose ports.
Save and deploy. Within ~3 minutes both services build and start.

4. Frontend — Vercel
vercel.com → Add New → Project → import zoefunds/Omnira.
Root Directory: apps/web. Vercel auto-detects Next.js.
Install Command: pnpm install --frozen-lockfile (set in Settings → General).
Build Command: leave default (pnpm build).
Environment Variables:
NEXT_PUBLIC_API_BASE=https://api.omnira.app (or the Railway-assigned URL)
Deploy. Vercel gives you omnira.vercel.app and lets you attach omnira.app.
5. CORS sanity
Open apps/api/src/server.ts:

await app.register(cors, { origin: true, credentials: true });
origin: true reflects whichever origin called, so omnira.app and omnira.vercel.app both work. In production you may want to lock it down:

await app.register(cors, {
  origin: [
    /https:\/\/.*\.vercel\.app$/,    // preview deploys
    'https://omnira.app',
    'https://www.omnira.app',
  ],
  credentials: true,
});
Same edit in realtime/socket.ts if you tighten Socket.IO CORS.

6. Going live checklist
not done
Neon Postgres reachable, migration ran.
not done
Upstash Redis ping succeeds (redis-cli -u rediss://... ping → PONG).
not done
Railway api service: https://api.omnira.app/health/ready returns { ok: true, checks: { postgres: ok, redis: ok } }.
not done
Railway worker service: logs show stockfish initialized.
not done
Vercel web: opens omnira.app, signup works, wallet renders.
not done
Two browsers + matchmaking → match starts, moves flow, chain register tx hits the api log.
not done
Studio explorer for one register tx: from is a player wallet (not the service wallet) → confirms onchain pipeline working through Railway.
Cost ballpark
Vercel free for hobby, $20/mo Pro when you need it.
Railway $5/mo per service (api + worker = ~$10) plus usage; Hobby plan covers small footprints.
Neon free tier covers low traffic.
Upstash free tier covers low traffic.
Total starting cost: ~$10/mo. Scales linearly.

When to outgrow this
Sustained > 100 concurrent matches → Socket.IO needs Redis adapter for horizontal scale. Add @socket.io/redis-adapter + run multiple api Railway replicas.
Worker CPU bound by Stockfish → run multiple worker replicas; polling queries naturally distribute.
Postgres hot → enable Neon read replicas, point profile / spectator / lobby reads at a replica via a second DATABASE_URL_READ.
