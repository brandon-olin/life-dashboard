# life_dashboard — Runbook

Operational procedures for deploying, upgrading, and troubleshooting the life_dashboard system. Written for Brandon's NAS (Synology + Docker + existing `postgres-1` container).

All `docker` and `docker compose` commands require `sudo` on Synology.

The repo on the NAS lives at `/volume1/docker/life-dashboard/`.

---

## Table of Contents

- [Synology Gotchas](#synology-gotchas)
- [Phase 0 — Schema Migration 0001](#phase-0--schema-migration-0001)
- [Phase 1 — Initial API Deployment](#phase-1--initial-api-deployment)
- [Phase 2 — Logseq Setup and Indexer](#phase-2--logseq-setup-and-indexer)
- [Ongoing Operations](#ongoing-operations)
- [Troubleshooting](#troubleshooting)

---

## Synology Gotchas

These are not obvious and will bite you again. Read before doing anything.

**Git is not installed by default.** Install the `Git Server` package from Package Center before trying to clone or pull on the NAS. Without it, git commands fail with `command not found`.

**`scp` fails on Synology.** Synology's SSH server does not expose the SFTP subsystem by default. Modern `scp` defaults to SFTP protocol and fails with `subsystem request failed on channel 0`. Use `scp -O` (legacy protocol mode) or avoid scp entirely and use git.

**`git status` shows every file as modified after a fresh clone.** Synology's filesystem stores executable bits differently. Git sees `old mode 100644 / new mode 100755` for every file. Fix immediately after cloning:
```bash
git config core.fileMode false
git config core.autocrlf false
```

**All docker commands require `sudo`.** The Synology system user is not in the `docker` group. Every `docker` and `docker compose` command on the NAS needs `sudo`.

**`docker compose` looks for `docker-compose.yml` in the current directory.** The compose file is in `infra/`, not the repo root. Always run:
```bash
cd /volume1/docker/life-dashboard
sudo docker compose -f infra/docker-compose.yml <command>
```
Or `cd infra/` first and run `sudo docker compose <command>` from there.

**`docker compose run --rm` does not rebuild the image.** After updating the Dockerfile or source code, always run `sudo docker compose build api` explicitly before `docker compose run` or `docker compose up`.

**Non-root containers cannot read Synology shared folders.** Synology shared folders use ACL-based permissions that don't map to standard Unix UIDs inside Docker containers. Even `755` Unix permissions are not enough. Services that need to read graph files (like the indexer) must run as `user: root`. The `:ro` mount flag prevents writes.

**`GID` is a reserved variable in zsh.** Don't use it as a shell variable name. Pick anything else.

---

## Phase 0 — Schema Migration 0001

> **Status: Complete.** This section is historical reference. Do not re-run.

Migration 0001 added multi-user support, audit log, tags, attachments, and retrofitted ownership columns on all existing entities. It was applied manually via `docker cp` + `psql`.

### Rollback (restore from backup, if ever needed)

The backup taken before Phase 0 is in `backups/`. To restore:

```bash
sudo docker exec -i postgres-1 dropdb -U brandon life_dashboard
sudo docker exec -i postgres-1 createdb -U brandon life_dashboard
sudo docker exec -i postgres-1 pg_restore -U brandon -d life_dashboard \
    < backups/life_dashboard_YYYYMMDD_HHMMSS.dump
```

---

## Phase 1 — Initial API Deployment

> **Status: Complete.** This section covers the one-time setup steps. For ongoing deployments, see [Ongoing Operations](#ongoing-operations).

### Prerequisites

- Phase 0 migration applied.
- Git installed on the NAS (`Git Server` package from Package Center).
- Tailscale installed and authenticated on the NAS.
- The `life-dashboard` Docker network exists and `postgres-1` is connected to it.

### One-time: Connect postgres-1 to the Docker network

```bash
sudo docker network create life-dashboard 2>/dev/null || true
sudo docker network connect life-dashboard postgres-1
```

This command is idempotent — safe to re-run.

### One-time: Clone the repo to the NAS

```bash
cd /volume1/docker
git clone https://github.com/YOUR_USERNAME/life-dashboard.git
cd life-dashboard
git config core.fileMode false
git config core.autocrlf false
```

### One-time: Create the environment file

```bash
cd /volume1/docker/life-dashboard/infra
cp .env.example .env
vi .env   # fill in DATABASE_URL password, JWT_SECRET_KEY, BOOTSTRAP_PASSWORD, ALLOWED_ORIGINS
```

### One-time: Update the Caddyfile

Replace `YOUR_NAS.tailnet-name.ts.net` with your actual Tailscale hostname in `infra/caddy/Caddyfile`.

### One-time: Obtain a Tailscale TLS certificate

```bash
sudo tailscale cert YOUR_NAS.tailnet-name.ts.net
```

The cert and key land in `/var/packages/Tailscale/var/certs/`. Verify:
```bash
ls -la /var/packages/Tailscale/var/certs/
```

### One-time: Run Alembic migrations

```bash
cd /volume1/docker/life-dashboard
sudo docker compose -f infra/docker-compose.yml build api
sudo docker compose -f infra/docker-compose.yml run --rm api \
    alembic -c /app/alembic.ini upgrade head
```

### One-time: Start all services

```bash
sudo docker compose -f infra/docker-compose.yml up -d
```

### Verify API is healthy

```bash
sudo docker compose -f infra/docker-compose.yml ps
curl -s http://localhost:8000/health | python3 -m json.tool
```

Expected health response: `{"status":"ok","database":"reachable"}`.

The first startup triggers the bootstrap flow: the backend detects the sentinel `!` password hash, hashes `BOOTSTRAP_PASSWORD` with argon2, writes it to the DB, and logs `Bootstrap complete`. After that, clear `BOOTSTRAP_PASSWORD` from `.env`.

---

## Phase 2 — Logseq Setup and Indexer

> **Status: Complete.** This section documents the setup and is the reference for re-running or troubleshooting.

### Logseq graph directories on the NAS

Both graphs live at:
- `/volume1/data/logseq/household-graph/` — shared household graph
- `/volume1/data/logseq/brandon-private/` — Brandon's personal graph

Each graph has this directory structure:
```
household-graph/
├── pages/
├── journals/
├── assets/
└── logseq/
    ├── bak/
    ├── version-files/
    └── config.edn
```

To recreate from scratch, run the setup script from the Mac:
```bash
cd /Users/brandonolin/Code/Personal/life-dashboard
./infra/logseq/setup-nas.sh
```

The script SSHes into the NAS and creates the directory structure and deploys `config.edn` for both graphs. It uses `ssh "cat > /remote/path" < localfile` (not `scp`) because Synology SSH doesn't expose SFTP.

### Opening graphs in Logseq (Mac)

The NAS graphs are exposed via SMB share. The share is mounted at `/Volumes/data/logseq/` on the Mac.

To open a graph in Logseq:
1. Open Logseq → Add Graph → select `/Volumes/data/logseq/household-graph/` or `/Volumes/data/logseq/brandon-private/`

If the share isn't mounted: `Finder → Go → Connect to Server → smb://192.168.68.58/data`

### Indexer service

The indexer runs as `infra-indexer-1`. It starts automatically with `docker compose up -d`.

Check indexer status:
```bash
sudo docker compose -f infra/docker-compose.yml ps indexer
sudo docker compose -f infra/docker-compose.yml logs -f indexer
```

Normal startup output:
```
connected to database
scanning household at /data/logseq/household-graph
scan complete: household — N page(s) indexed
scanning brandon-private at /data/logseq/brandon-private
scan complete: brandon-private — N page(s) indexed
watching 2 graph(s) for changes
```

After startup, any `.md` file change in either graph produces a log line like:
```
indexed  household :: Projects/My Plan
```

### Verify logseq_index content

```bash
sudo docker exec postgres-1 psql -U brandon -d life_dashboard \
    -c "SELECT graph, count(*) FROM logseq_index GROUP BY graph;"
```

To search the index:
```sql
SELECT graph, page_name, tags
FROM logseq_index
WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'your search term');
```

### Add a new graph

1. Create the directory structure on the NAS (copy the pattern from `setup-nas.sh`).
2. Deploy a `config.edn` with the same settings as the existing graphs.
3. Add the new graph to `LOGSEQ_GRAPHS` in `infra/.env`:
   ```
   LOGSEQ_GRAPHS=household:/data/logseq/household-graph,brandon-private:/data/logseq/brandon-private,new-graph:/data/logseq/new-graph
   ```
4. Add a new volume mount in `infra/docker-compose.yml` under the indexer service:
   ```yaml
   - /volume1/data/logseq/new-graph:/data/logseq/new-graph:ro
   ```
5. Restart the indexer:
   ```bash
   sudo docker compose -f infra/docker-compose.yml up -d indexer
   ```

---

## Ongoing Operations

### Update the API after a code change

The repo on the NAS is a git clone. Push changes to GitHub from the Mac, then pull and rebuild on the NAS.

**On the Mac:**
```bash
git push origin main
```

**On the NAS:**
```bash
cd /volume1/docker/life-dashboard
git pull origin main
sudo docker compose -f infra/docker-compose.yml build api
sudo docker compose -f infra/docker-compose.yml run --rm api \
    alembic -c /app/alembic.ini upgrade head
sudo docker compose -f infra/docker-compose.yml up -d api indexer
```

If there are no new migrations, skip the `alembic upgrade head` step.

> **Note:** `docker compose run --rm` does not rebuild the image. Always run `docker compose build api` explicitly after pulling new code.

### View logs

```bash
# API
sudo docker compose -f infra/docker-compose.yml logs -f api

# Indexer (watch real-time indexing)
sudo docker compose -f infra/docker-compose.yml logs -f indexer

# Caddy
sudo docker compose -f infra/docker-compose.yml logs --tail=100 caddy
```

### Restart a service

```bash
sudo docker compose -f infra/docker-compose.yml restart api
sudo docker compose -f infra/docker-compose.yml restart indexer
```

### Check service health

```bash
sudo docker compose -f infra/docker-compose.yml ps
curl -s http://localhost:8000/health | python3 -m json.tool
```

### Apply a new Alembic migration

```bash
cd /volume1/docker/life-dashboard
sudo docker compose -f infra/docker-compose.yml run --rm api \
    alembic -c /app/alembic.ini upgrade head
```

### Back up the database

```bash
sudo docker exec postgres-1 pg_dump -U brandon -Fc life_dashboard \
    > "life_dashboard_$(date +%Y%m%d_%H%M%S).dump"
```

### Refresh the Tailscale certificate (every ~90 days)

```bash
sudo tailscale cert YOUR_NAS.tailnet-name.ts.net
sudo docker compose -f infra/docker-compose.yml restart caddy
```

---

## Troubleshooting

### Indexer shows no logs after `docker compose logs -f indexer`

The indexer may not be running. Check:
```bash
sudo docker compose -f infra/docker-compose.yml ps
```
If `indexer` is absent or exited, start it:
```bash
sudo docker compose -f infra/docker-compose.yml up -d indexer
```

### Indexer: `PermissionError: [Errno 13] Permission denied: '/data/logseq/...'`

The indexer container is running as a non-root user. Synology ACL permissions gate access at a layer above standard Unix permissions — even `755` is not enough. Fix: ensure `user: root` is set in the indexer service in `infra/docker-compose.yml`. The `:ro` mount flag prevents any writes.

### API container is `unhealthy`

```bash
sudo docker compose -f infra/docker-compose.yml logs api
```
Common causes:
- Database not reachable: verify `postgres-1` is on the `life-dashboard` network (`sudo docker network inspect life-dashboard`)
- Bad `DATABASE_URL` in `.env`
- Alembic migrations not applied (`alembic upgrade head`)

### `git status` shows everything as modified on the NAS (permission bits)

```bash
git diff HEAD  # look for "old mode 100644 / new mode 100755" — no content diff
git config core.fileMode false
git config core.autocrlf false
git status     # should be clean now
```

### `git pull` fails: `Your local changes would be overwritten`

The NAS repo has unstaged changes (often `.env` or generated files). Options:

```bash
# Stash local changes, pull, reapply
git stash
git pull origin main
git stash pop

# Or if you don't care about local changes (WARNING: destructive)
git fetch origin
git reset --hard origin/main
```

### `docker compose` says "no configuration file provided"

You're running `docker compose` from the repo root where there's no `docker-compose.yml`. Either:
```bash
cd infra/
sudo docker compose <command>
# OR
sudo docker compose -f infra/docker-compose.yml <command>
```

### Alembic: `PermissionError` on `/app/migrations/env.py`

The Dockerfile's `COPY` directives in the runtime stage are missing `--chown=appuser:appuser`. Check the Dockerfile — all three `COPY` directives in the runtime stage should have the flag:
```dockerfile
COPY --chown=appuser:appuser --from=builder /venv /venv
COPY --chown=appuser:appuser alembic.ini .
COPY --chown=appuser:appuser migrations/ migrations/
```
Rebuild after fixing: `sudo docker compose -f infra/docker-compose.yml build api`

### `scp` fails: `subsystem request failed on channel 0`

Synology's SSH server doesn't expose SFTP. Use `scp -O` for legacy protocol, or use git (`git push` from Mac + `git pull` on NAS). The git workflow is preferred.

### NAS repo in a broken merge state

```bash
# Abort and return to pre-merge state
git reset --hard ORIG_HEAD

# If that fails or ORIG_HEAD is gone, nuke to match remote
git fetch origin
git reset --hard origin/main
```

### `GID: bad math expression: operand expected` in zsh

`GID` is a read-only special variable in zsh. Rename your variable to anything else.
