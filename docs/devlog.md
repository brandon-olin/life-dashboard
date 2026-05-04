# life_dashboard — Developer Log

A running record of progress, decisions, and context for the life_dashboard project — written as it happens, so the full picture is never lost.

---

## What We're Building

life_dashboard is a local-first, privacy-first life-management system for a household. The core idea: all personal knowledge — notes, journals, tasks, goals, habits, recipes, grocery lists — lives in Logseq as markdown files on a home NAS, never leaving the hardware. A FastAPI backend owns the structured domains that genuinely need a database: contacts, calendar events, auth, and AI indexing. And eventually, a local LLM running on a home gaming PC reasons over the data and takes actions — without ever leaving the network.

This is not a SaaS product. It's a personal system designed to run on hardware you own, where you control the data model, the privacy boundaries, and the automation logic.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Knowledge engine | Logseq (markdown files on NAS) |
| Graph storage | Synology NAS at `/volume1/data/logseq/` |
| Database | Postgres 16 (self-hosted in Docker on NAS) |
| Backend language | Python 3.12 |
| Backend framework | FastAPI |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Graph indexer | Python + watchdog + asyncpg |
| Validation / settings | Pydantic v2 |
| Auth | argon2 + JWT + refresh tokens |
| Deployment | docker-compose on the NAS |
| Remote access | Tailscale (no public internet exposure) |
| AI agent | Local LLM (Ollama / LM Studio) + MCP server (future) |

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| 0 | Schema migration: multi-user, audit log, tags, attachments | ✅ Complete |
| 1 | FastAPI backend: auth, CRUD for all original domains | ✅ Complete |
| 2 | Logseq pivot: retire domain tables, add graph indexer | ✅ Complete |
| 3 | Initial Logseq structure + Notion data migration | 🔄 In progress |
| 4 | MCP server: AI querying over logseq_index | Not started |
| 5 | Home Assistant integration | Future |

---

## Design Considerations

- **Logseq-first.** Notes, tasks, goals, habits, recipes, and grocery lists live in Logseq as plain markdown. Postgres is reserved for the things that genuinely need a relational database: contacts, calendar events, auth, audit, and the AI search index. The UI is Logseq itself — not a bespoke web app built on top of a database.

- **Privacy-first, hardware-owned.** All data lives on the NAS. Remote access is via Tailscale — a personal VPN — not the public internet. Nothing touches a cloud service.

- **Graph boundaries.** Three graphs enforce strict privacy: `household` (shared), `brandon-private` (personal), and eventually `partner-private`. No service or output crosses these boundaries without explicit configuration.

- **Governed AI.** The local LLM agent never speaks SQL or writes files directly. It reads through the `logseq_index` table (a read-only Postgres index of graph content) and writes back through a curated MCP tool vocabulary. The AI is powerful but legible.

- **Open format.** Logseq stores everything as plain markdown. Calendar events are iCal-compatible. Contacts are vCard-compatible. No proprietary formats — every piece of data can be read with a text editor.

- **Audit everything.** Every write through the backend produces an `audit_log` row with actor identity and a structured diff. When the AI agent is in the loop, there's always a record of what it did and why.

---

## Progress Log

### Phase 0 — Schema Migration (Complete)

**What the existing schema looked like:** The Postgres database already had a solid domain schema — goals, todos, habits, notes, calendar events, contacts, recipes, grocery lists. All with UUIDs, timestamps, and sensible relationships. But it had been designed for a single user with no concept of households, no audit trail, and no structured tags.

**What Phase 0 added:**

- `households` and `users` tables with `household_memberships` joining them. Every core entity was retrofitted with `household_id` (NOT NULL) and `created_by_user_id`.
- An `audit_log` table that will record every backend write with actor identity and a structured diff.
- An `attachments` table for file references linked to any entity.
- A normalized `tags` + `taggings` system, coexisting with legacy `text[]` tag columns (those get migrated later once the backend is confirmed stable).
- `refresh_tokens` for the JWT auth system.
- A `schema_migrations` version-tracking table.
- Backfill of a default household and a sentinel `brandon@life-dashboard.local` user (password hash `'!'` — cryptographically impossible to match, forces password setup on first backend run).
- Missing `updated_at` triggers added to tables that lacked them.
- Household-scoped indexes on every retrofitted table.

**How it was applied:**

The migration SQL was written by hand and validated with `pglast` (Postgres's real parser library) before touching the database. A schema-only backup was taken via `pg_dump` into the `backups/` folder. The migration was copied into the running `postgres-1` container and applied with `psql`. Post-migration, orphan counts on all eight retrofitted tables returned zero — confirming the backfill was clean.

**Infrastructure work to get there:**

Getting the monorepo from the development Mac to the NAS required a few detours: `git` isn't installed on Synology DSM by default, rsync over SSH was blocked by DSM's SSH configuration, and the destination directory needed to exist before transfer. The eventual solution was piping `tar` through SSH — a reliable fallback that bypasses rsync's server-mode requirement entirely.

---

### Phase 1 — FastAPI Backend (Complete)

Phase 1 was the largest single chunk of work in the project so far — going from a database with no application layer to a fully deployed, smoke-tested REST API running in Docker on the NAS.

**What was built:**

The backend covers every domain in the schema. Auth landed first — argon2 password hashing, JWT access tokens (15-minute lifetime), httpOnly refresh token cookies, and a first-run bootstrap flow that lets you set a real password for the sentinel user created in Phase 0. From there, ten domain modules were built in sequence: tags, notes, goals, todos, habits, calendar events, contacts, recipes, and grocery lists. Each follows a strict four-file structure (models → schemas → service → router) with all database logic isolated in the service layer and thin FastAPI wrappers in the router.

Two additional Alembic migrations were written and applied to the live NAS database during this phase: one dropping the legacy `text[]` tags column from notes (replaced by the normalized `taggings` table), and one adding Obsidian-style hierarchy (`parent_note_id`) and a graph links table (`note_links`) to notes.

The notes domain became the reference implementation — it's the most complex, handling hierarchical structure, graph links, backlinks, and polymorphic tags all loaded via bulk queries in four round trips. Every other domain that came after it was modeled on the same patterns.

**The hard-won lessons:**

Several of these bit during development and are worth understanding because they'll surface again later.

The async SQLAlchemy constraint that caused the most friction was `lazy="noload"` on relationships. In an async context, SQLAlchemy raises `MissingGreenlet` the moment you touch a relationship attribute that hasn't been explicitly loaded — including when Pydantic calls `model_validate()` on an ORM object. The fix is to declare every relationship as `lazy="noload"` and load related data manually via bulk queries before building the response. The `_enrich()` pattern in the notes service is the canonical example: load the main objects, then fetch tags, children, links, and backlinks in separate `SELECT ... WHERE id IN (...)` queries, then inject them via `model_copy()`.

SQLAlchemy's enum handling against an existing Postgres schema has a silent footgun: if you pass the type name as a string to `SaEnum()` instead of the actual enum values, it creates a single-member enum containing the type name as a literal value. Everything appears to work until runtime, when SQLAlchemy tries to map a real value like `"medium"` to a Python object and raises `LookupError`. The fix: always pass the actual string values (or the Python enum class) to `SaEnum`, and always set `create_type=False` since the types were created by migrations, not the ORM.

Pydantic-settings has a similar silent failure with list fields. If you declare `allowed_origins: list[str]`, pydantic-settings tries `json.loads()` on the env var value before any validator runs. A bare comma-separated string isn't valid JSON, so it raises `ValidationError` at startup with a confusing message. The fix is to declare it as `str` and split it at point of use in `main.py`.

The `metadata` naming collision was a one-time surprise: SQLAlchemy's `DeclarativeBase` reserves the class attribute name `metadata` for its own use. Any ORM column named `metadata` has to be aliased to `metadata_` in Python and mapped back with `mapped_column("metadata", ...)`. The Pydantic response schema then uses `validation_alias="metadata_"` to serialize it correctly.

**Deployment stumbling blocks:**

The Docker network was the trickiest: the `postgres-1` container lives on a manually-created Docker network (`docker network create life-dashboard`). Docker Compose refuses to adopt a manually-created network unless you declare it `external: true` in the compose file — without that flag it tries to create its own network with the same name, fails because it already exists, and errors out with a confusing message.

Alembic's migration files and `alembic.ini` are not part of the installed Python package — they're plain files on disk. The Dockerfile initially only copied `src/`. Running migrations inside the container failed immediately with `No 'script_location' key found in configuration` until those two explicit `COPY` directives were added to the runtime stage.

`docker compose run --rm` does not rebuild the image. This seems obvious in retrospect, but after updating the Dockerfile and re-running the migration command, the old cached image kept running. Explicit `docker compose build api` is required any time the Dockerfile changes.

One last one that caused twenty minutes of confusion: `GID` is a read-only special variable in zsh. Using it as a shell variable to store a grocery list ID during smoke testing raises `bad math expression: operand expected` with no useful context about why. Use any other name.

---

### Phase 2 — Logseq Pivot + Graph Indexer (Complete)

**The decision:**

After Phase 1 shipped a working CRUD backend for every domain, it became clear that building and maintaining a custom data model, API, and UI for notes, tasks, goals, habits, recipes, and grocery lists was solving a problem that Logseq already solves better. Logseq provides linking, queries, templates, tagging, journaling, and a plugin system — all for free, in plain markdown files. The original architecture was reinventing it as a bespoke web app.

The pivot: Logseq becomes the primary UI and source of truth for all personal knowledge. Postgres keeps only the domains that genuinely need a relational database — contacts, calendar events, auth, audit, tags, and attachments. A new `logseq_index` table gives the future AI agent a queryable, full-text-searchable window into the Logseq graphs without ever writing to them directly.

**What was retired (migration 0004):**

Eleven tables were dropped: `note_links`, `notes`, `habit_occurrences`, `habits`, `grocery_items`, `recipe_steps`, `recipe_ingredients`, `grocery_lists`, `recipes`, `todos`, and `goals`. The `note_type` and `priority_level` Postgres enums went with them.

A non-obvious FK dependency bit during the migration: `calendar_events` carried `todo_id` and `goal_id` columns referencing the retired tables. These had to be dropped from `calendar_events` before `todos` and `goals` could be removed. The lesson: when retiring tables, always check whether *kept* tables have FKs pointing *into* the retired set, not just the other direction.

Six domain directories were deleted from the FastAPI codebase (`notes/`, `goals/`, `todos/`, `habits/`, `recipes/`, `grocery_lists/`), and their router imports removed from `main.py` and `env.py`. The downgrade for this migration is intentionally a no-op — data cannot be recovered from a DROP without a database backup.

**What was added (migration 0005):**

A new `logseq_index` table stores one row per Logseq page: graph name, page name, file path, full markdown content, parsed page properties (JSONB), tags (text array), block count, and a SHA-256 content hash for change detection. Indexes: unique on `(graph, page_name)`, btree on `graph`, GIN on `tags`, and a functional GIN on `to_tsvector('english', content)` for full-text search.

**Logseq setup on the NAS:**

Both graphs were scaffolded at `/volume1/data/logseq/household-graph/` and `/volume1/data/logseq/brandon-private/` using a setup script (`infra/logseq/setup-nas.sh`) that SSHes in to create the directory structure and deploy `logseq/config.edn`. Each graph is configured for markdown format, with triple-lowbar file naming (`Projects___My Plan.md` → page name `Projects/My Plan`) to keep the `pages/` directory flat. The graphs are exposed to the Mac via an SMB share on the NAS and mounted at `/Volumes/data/logseq/`.

**Graph indexer service:**

The indexer (`api/src/life_dashboard/indexer/`) is a Python async service that:
1. On startup, walks each graph's `pages/` and `journals/` directories, parses each `.md` file, and upserts the result into `logseq_index`. Rows whose `content_hash` hasn't changed are skipped at the Postgres level (`WHERE content_hash IS DISTINCT FROM EXCLUDED.content_hash`).
2. Starts a `watchdog` filesystem observer for each graph root, bridging file events into an `asyncio.Queue`.
3. Processes the queue: `on_created`/`on_modified` trigger a parse + upsert; `on_deleted` removes the row; `on_moved` handles renames atomically.

The indexer reuses the same Docker image as the API (same `pyproject.toml` dependencies, same Python package) but runs with a different `command`. The `logseq_index` upsert is the only Postgres write path; the graph files themselves are mounted read-only.

Parser logic: Logseq property drawers (`key:: value` lines at the top of the file) are parsed into the `properties` JSONB column. Tags are extracted from the `tags::` property and from inline `#tag` syntax, deduplicated with property tags taking precedence. Journal files (`journals/2024_01_15.md`) are stored with page names like `journals/2024-01-15`.

**Hard-won lessons:**

**Git on Synology.** Git is not installed by default on Synology DSM. Install the `Git Server` package from Package Center. Until this is done, the only reliable way to get files onto the NAS is `tar` piped over SSH:
```bash
tar -czf - path/to/files | ssh user@nas "cd /dest && tar -xzf -"
```

**`scp` fails on Synology.** Synology's SSH server does not expose the SFTP subsystem by default. Modern `scp` defaults to SFTP and fails with `subsystem request failed on channel 0`. Two workarounds: use `scp -O` (legacy protocol mode) or use `ssh "cat > remotefile" < localfile`. The latter is the more reliable fallback.

**Git `core.fileMode` and `core.autocrlf` on Synology.** After cloning or resetting the repo on the NAS, `git status` shows every file as modified even with an up-to-date working tree. The cause is Synology's filesystem storing executable bits on files that git tracks as non-executable (`644` vs `755`). Fix: `git config core.fileMode false`. A related issue is `core.autocrlf` defaulting to `true` on some setups, causing git to see CRLF/LF differences on every file. Fix: `git config core.autocrlf false`. Both should be set in the NAS repo after initial clone.

**Docker COPY file ownership.** Files copied into a Docker image with `COPY` land owned by root. If the container subsequently runs as a non-root user (`USER appuser`), those files are unreadable — Alembic fails with `PermissionError` when trying to read `migrations/env.py`. The fix is to use `--chown=appuser:appuser` on every `COPY` directive in the runtime stage.

**Synology ACL permissions and Docker containers.** Synology shared folders use ACL-based permissions that don't map to standard Unix UIDs inside Docker containers. A non-root container user (`appuser`) cannot read a shared folder even if the folder has `755` permissions, because the Synology ACL gates access at a layer above standard Unix permissions. The indexer service runs as `root` to work around this. The volume is mounted `:ro`, so the container cannot modify graph files regardless.

**Merge state on the NAS.** When the NAS repo ended up in a broken merge state (failed `git merge --abort` due to an unstaged file), the escape hatch was `git reset --hard ORIG_HEAD`. `ORIG_HEAD` is set by git before any merge and points to the clean pre-merge commit. `--hard` overrides unstaged changes that would otherwise block the reset. For persistent dirty-status issues after reset, `git fetch origin && git reset --hard origin/main` is the nuclear option that forces the working tree to exactly match the remote.

---

## Forward-Looking Architecture Decisions

**Logseq as the UI layer.** The original plan was a Next.js web app as the day-to-day interface. With the Logseq pivot, Logseq itself is the UI. Custom interfaces are only needed where Logseq's native query system and plugin ecosystem cannot reach. This dramatically reduces the amount of code to build and maintain.

**`logseq_index` as the AI's read interface.** The local LLM never reads raw markdown files and never writes to the graph. It reads `logseq_index` via the MCP server — a table with full-text search, tag filtering, and per-graph scoping. This is the governed AI principle in practice: the AI has a well-defined, read-only window into the knowledge base, not open file access.

**Python + FastAPI.** Still the right choice. Python has the richest LLM and AI agent ecosystem — the official Anthropic and OpenAI SDKs, the MCP SDK, LangChain, LlamaIndex — and Home Assistant is also Python, meaning the service layer can eventually be wrapped as a custom integration with minimal friction.

**The service layer split.** The backend's service layer imports nothing from FastAPI. Both the REST API and the future MCP server call into the same service layer. This remains the most consequential architectural decision in the project.

**Tailscale over a public server.** No attack surface to maintain, no TLS certificate management beyond a single Caddy config, no monthly VPS bill. The family accesses the dashboard by URL on their phones, exactly like any web app — they just happen to be on a private network.
