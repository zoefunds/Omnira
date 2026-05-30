# Omnira — security checklist

Run this before every production push. Keep this file under version control.

## Secrets

- [ ] `WALLET_MASTER_SECRET` is **backed up to two independent media** (password manager + sealed envelope / hardware token). Loss = irreversible loss of every user wallet on the platform.
- [ ] `JWT_SECRET`, `WALLET_MASTER_SECRET`, `GENLAYER_SERVICE_PRIVATE_KEY`, `ADMIN_TOKEN` were minted with `openssl rand -hex 64` (or 32 for ADMIN_TOKEN). No reused values.
- [ ] `.env` on the server has mode `0600` and owner `omnira`. Run `stat -c "%a %U" /srv/omnira/.env` → must be `600 omnira`.
- [ ] No secrets in git history. `git log -p -S 'WALLET_MASTER_SECRET=' --all` returns empty.
- [ ] CI environment uses repo-scoped secrets, never committed. GitHub Actions: secrets must reference `${{ secrets.X }}` only.
- [ ] Rotation runbook for `JWT_SECRET`: new deployment rotates → all existing JWTs invalidated. Users re-login via refresh tokens still in DB.

## Wallets / chain

- [ ] Service wallet (`GENLAYER_SERVICE_PRIVATE_KEY` derived address) has alerting on **low balance** (it pays gas for funding new users on signup — empty wallet breaks signups).
- [ ] Match registrar wallets (each user's deterministic wallet) are derived deterministically — verified by `apps/api/src/wallet/derive.test.ts`.
- [ ] Contract addresses pinned in `.env`. Mismatch with deployed bytecode → user games not recorded.
- [ ] Per-color signing verified: every chess move tx's `from` is the moving player's wallet (not the service wallet). Check periodically by sampling Studio explorer.

## Auth

- [ ] Argon2id params at OWASP 2024: `memoryCost=64MiB time=3 parallelism=4`. See `apps/api/src/auth/password.ts`.
- [ ] Login lockout: 5 failures / 10-min window → 15-min lockout. Verified by `apps/api/src/auth/lockout.ts`.
- [ ] Refresh tokens stored as `sha256(raw)` in `Session.tokenHash`. Raw token never logged. Verified by `apps/api/src/auth/sessions.ts`.
- [ ] Access JWT TTL = 1 hour. Refresh TTL = 30 days. Revocation via `Session.revokedAt`.
- [ ] Rate limits: tight on `/auth/signup` and `/auth/login` (10/min/IP); looser on reads. Polls (`/match/:id/analysis`, `/match/:id/onchain`, etc.) exempted from rate limit.

## Transport

- [ ] HTTPS enforced (HSTS header set by nginx; HTTP→HTTPS 301).
- [ ] TLS 1.2+ only. `ssl_protocols TLSv1.2 TLSv1.3` in nginx.
- [ ] Helmet CSP / referrer-policy / x-frame-options applied via `@fastify/helmet`.

## Inputs

- [ ] All request bodies are zod-validated at the route boundary (search: `safeParse`).
- [ ] Usernames `/^[a-zA-Z0-9_]{3,20}$/`. Email max 254 chars.
- [ ] Chat messages capped at 500 chars (`@db.VarChar(500)` + zod).
- [ ] UCI moves match `/^[a-h][1-8][a-h][1-8][qrbn]?$/` before being sent to chess.js. Prevents arbitrary string injection into the engine path.

## Admin

- [ ] `/admin/flags` etc. require `X-Admin-Token` matching `ADMIN_TOKEN`. Never share. Rotate quarterly.
- [ ] Reviewer notes on `SuspicionFlag.reviewerNote` are visible only to admins.

## Dependencies

- [ ] `pnpm audit --prod` clean (zero high/critical) at every release.
- [ ] Pin major versions in `package.json`. Patch updates via Dependabot.
- [ ] Lockfile (`pnpm-lock.yaml`) committed.

## Observability

- [ ] `journalctl -u omnira-{api,worker,web}` parsed by your log aggregator.
- [ ] `/health/ready` polled every 60 s by uptime monitor. Alert on `503` for > 2 min.
- [ ] Slow query log on Postgres: `log_min_duration_statement = 250ms`.
- [ ] Stockfish hangs are surfaced — the worker logs `analyze failed` and marks a permanent stub. Track aggregate count.

## Backups

- [ ] Postgres: nightly pg_basebackup OR streaming WAL to S3. Test restore quarterly.
- [ ] `WALLET_MASTER_SECRET`: see Secrets section. **Most important secret in the system.**
- [ ] `.env`: encrypted backup of the whole file. Recreating it from scratch will produce different wallets for new users — old users keep theirs only as long as `WALLET_MASTER_SECRET` survives.

