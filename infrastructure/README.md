# Omnira — production deployment

Target: a single Debian 12 / Ubuntu 24.04 box (≥ 2 vCPU, 4 GB RAM).
Single-host is fine for low-traffic launch; horizontal scale notes at the bottom.

## 1. System packages

```bash
sudo apt update
sudo apt install -y nginx postgresql redis-server stockfish certbot python3-certbot-nginx \
                    git build-essential curl ca-certificates
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@9
2. User & filesystem
sudo useradd -r -m -d /srv/omnira -s /bin/bash omnira
sudo mkdir -p /var/log/omnira && sudo chown omnira:omnira /var/log/omnira
3. Database & Redis
sudo -u postgres psql <<'SQL'
CREATE ROLE omnira LOGIN PASSWORD 'CHANGE_ME_PROD';
CREATE DATABASE omnira OWNER omnira;
ALTER ROLE omnira CREATEDB;  -- prisma shadow DB
SQL

# Redis runs default localhost:6379
sudo systemctl enable --now redis-server
4. Clone + build
sudo -u omnira -i
cd /srv/omnira
git clone https://github.com/zoefunds/Omnira.git .
pnpm install --frozen-lockfile

# Copy .env.example → .env and fill in:
#   DATABASE_URL=postgresql://omnira:CHANGE_ME_PROD@localhost:5432/omnira
#   REDIS_URL=redis://localhost:6379
#   JWT_SECRET=$(openssl rand -hex 64)
#   WALLET_MASTER_SECRET=$(openssl rand -hex 64)   # BACK UP SECURELY — see Phase 13E checklist
#   ADMIN_TOKEN=$(openssl rand -hex 32)
#   GENLAYER_RPC_URL, GENLAYER_MATCH_REGISTRY_ADDRESS, GENLAYER_ANALYSIS_ORACLE_ADDRESS,
#   GENLAYER_TOURNAMENT_REGISTRY_ADDRESS, GENLAYER_SERVICE_PRIVATE_KEY
#   STOCKFISH_PATH=/usr/games/stockfish
cp .env.example .env
$EDITOR .env
chmod 600 .env

# Migrate DB
pnpm --filter @omnira/db run migrate:deploy

# Build all three deployables
pnpm --filter @omnira/api  build
pnpm --filter @omnira/worker build
pnpm --filter @omnira/web   build
5. Install services
sudo cp /srv/omnira/infrastructure/systemd/omnira-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now omnira-api omnira-worker omnira-web

# verify
systemctl status omnira-api omnira-worker omnira-web
journalctl -fu omnira-api
6. Nginx + TLS
sudo cp /srv/omnira/infrastructure/nginx/omnira.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/omnira.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# TLS
sudo certbot --nginx -d omnira.app -d www.omnira.app
sudo systemctl enable certbot.timer
7. Health checks
curl -fsS https://omnira.app/health         | jq .
curl -fsS https://omnira.app/health/ready   | jq .   # 200 if DB+Redis healthy, 503 otherwise
Wire /health/ready into your uptime monitor.

8. Updating
sudo -u omnira -i
cd /srv/omnira
git pull
pnpm install --frozen-lockfile
pnpm --filter @omnira/db run migrate:deploy
pnpm --filter @omnira/api  build
pnpm --filter @omnira/worker build
pnpm --filter @omnira/web   build
sudo systemctl restart omnira-api omnira-worker omnira-web
Horizontal scaling notes
API: behind a load balancer, multiple instances. Switch Socket.IO from the in-memory adapter to @socket.io/redis-adapter so room broadcasts cross instances. Add Redis pub/sub channel.
Web: stateless Next.js — duplicate behind LB freely.
Worker: single instance is fine for moderate volume; if Stockfish is bottlenecked, run N workers — the polling queries naturally distribute work because each picks the latest unprocessed match.
Postgres: read replicas for /u/*, /tournaments, /watch if read traffic dominates.
