# Architecture

## Principles

1. **Local-first.** Every piece of household data lives on hardware Brandon owns. No third-party cloud sees any of it. Remote access is via Tailscale — a personal VPN — not the public internet.
2. **Logseq-first.** Notes, tasks, goals, habits, recipes, and grocery lists live in Logseq as plain markdown files. The Logseq UI itself is the day-to-day interface. Custom software is only built where Logseq cannot reach.
3. **Governed AI.** The local LLM never reads raw markdown files and never writes to the graph. It reads through `logseq_index` (a Postgres table that mirrors graph content) and writes back through a curated MCP tool vocabulary. Powerful but auditable.
4. **Open formats.** Logseq stores everything as plain markdown. Calendar events are iCal-compatible. Contacts are vCard-compatible. No proprietary formats — every piece of data can be read with a text editor and migrated without vendor permission.
5. **Audit everything.** Every write through the backend produces an `audit_log` row with actor identity and a structured diff. When the AI is in the loop, there is always a record of what it did and why.

---

## Data Ownership

Two systems own data. The boundary is strict.

| Domain | Owner | Why |
|---|---|---|
| Notes, journals, tasks, goals, habits, recipes, grocery lists | **Logseq** (markdown files on NAS) | Logseq's query, linking, and templating system handles these better than a custom CRUD app |
| Contacts | **Postgres** | Relational structure, household sharing, vCard compatibility |
| Calendar events | **Postgres** | Structured queries, recurrence, iCal compatibility |
| Auth, households, users | **Postgres** | Relational, security-sensitive |
| Audit log | **Postgres** | Append-only, structured diffs |
| Tags, attachments | **Postgres** | Normalized, cross-entity |
| AI search index | **Postgres** (`logseq_index`) | Enables FTS and agent querying without touching raw files |

---

## Graph Boundaries

Three Logseq graphs enforce strict privacy:

| Graph | Purpose | Who sees it |
|---|---|---|
| `household` | Shared household knowledge: shared tasks, grocery, meal plans, home projects | All household members |
| `brandon-private` | Personal notes, journal, personal goals | Brandon only |
| `partner-private` (future) | Partner's personal notes and journal | Partner only |

No service, output, or AI query crosses graph boundaries without explicit configuration.

---

## Components

### Logseq (primary UI)

Logseq runs on each user's machine and opens graphs from the NAS via SMB mount. It is the day-to-day writing, tasking, and organizational interface. No custom frontend is built for any domain that Logseq handles.

Graphs live on the NAS at `/volume1/data/logseq/`:
- `household-graph/` — shared household graph
- `brandon-private/` — Brandon's personal graph

Both use markdown format with triple-lowbar file naming (e.g., `Projects___My Plan.md` stores page `Projects/My Plan`).

### Database (NAS, `postgres-1` container)

Postgres 16 in the `postgres-1` container, database `life_dashboard`, owner `brandon`. Holds the structured domains (contacts, calendar, auth, audit, tags, logseq_index). Never exposed to the LAN — only reachable from the `life-dashboard` Docker network.

### Backend API (NAS, `infra-api-1` container)

FastAPI + SQLAlchemy 2.0 async + Alembic. Handles auth, contacts, calendar events, and tags. Deployed as a Docker container on the `life-dashboard` network alongside `postgres-1`.

Internal structure:

```
api/src/life_dashboard/
├── core/           # Settings, DB session
├── domains/
│   ├── auth/       # argon2 password hashing, JWT, refresh tokens
│   ├── calendar_events/
│   ├── contacts/
│   └── tags/
└── indexer/        # Graph indexer service (runs as a separate container)
```

The service layer (`domains/*/service.py`) imports nothing from FastAPI. Both the REST API and the future MCP server call into the same service layer.

### Graph Indexer (NAS, `infra-indexer-1` container)

A Python async service that keeps `logseq_index` in sync with the Logseq graph files.

**On startup:** Walks each graph's `pages/` and `journals/` directories. Parses each `.md` file (extracts page properties, tags, block count, content hash). Upserts into `logseq_index`. Rows unchanged since last index are skipped at the Postgres level via `WHERE content_hash IS DISTINCT FROM EXCLUDED.content_hash`. Orphaned rows (files deleted since last run) are removed via reconcile.

**After startup:** Watchdog filesystem observer watches each graph root. File create/modify events trigger parse + upsert. Delete events remove the row. Move events are handled atomically (delete old path, upsert new path). File events are bridged from the watchdog thread into an asyncio queue.

The indexer runs in the same Docker image as the API but with a different `command`. It runs as `root` because Synology shared folders use ACL-based permissions that don't map to container UIDs — non-root containers cannot read the graphs even with `755` Unix permissions. The volume is mounted `:ro` so the container cannot modify graph files regardless.

### `logseq_index` Table

The AI's read window into the Logseq graphs. Schema:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `graph` | text | Graph name (e.g., `household`, `brandon-private`) |
| `page_name` | text | Page name as shown in Logseq (e.g., `Projects/My Plan`, `journals/2024-01-15`) |
| `file_path` | text | Absolute path to the source `.md` file on the NAS |
| `content` | text | Full markdown content of the page |
| `properties` | JSONB | Parsed Logseq property drawer (`key:: value` pairs) |
| `tags` | text[] | Tags from `tags::` property + inline `#tag` syntax, deduplicated |
| `block_count` | integer | Count of lines matching `^\s*-\s` |
| `content_hash` | text | SHA-256 of content, used for change detection |
| `last_indexed_at` | timestamptz | When this row was last updated |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

Indexes: unique on `(graph, page_name)`, btree on `graph`, GIN on `tags`, functional GIN on `to_tsvector('english', content)` for full-text search.

### Caddy (NAS, `infra-caddy-1` container)

TLS termination and reverse proxy. Serves `https://YOUR_NAS.tailnet-name.ts.net`. Certificates are issued by Tailscale and stored at `/var/packages/Tailscale/var/certs/`.

### Local LLM (gaming PC, future — Phase 4)

Ollama or LM Studio running on the gaming PC on the same Tailscale network. The MCP server (to be built in Phase 4) will expose the `logseq_index` to the LLM via a curated tool vocabulary. The LLM reads through `logseq_index` and writes back through MCP tools — never directly to the graph files or Postgres.

---

## Network Topology

```
[ Mac / phones / laptops ]
           |
           | Tailscale
           |
   [ NAS (192.168.68.58) ]
           |
     Docker network: life-dashboard
           |
     +-----+---------------------------+
     |                                 |
  infra-api-1 (FastAPI :8000)     postgres-1 (Postgres :5432)
  infra-indexer-1 (indexer)
  infra-caddy-1 (Caddy :80/:443)
           |
     Logseq graphs (SMB share)
           |
     /volume1/data/logseq/
       household-graph/
       brandon-private/

[ Gaming PC ] --Tailscale--> [ infra-api-1 MCP endpoint (future) ]
     |
     +-- Local LLM (Ollama / LM Studio)
```

---

## Permission Model

Three actor types: `user`, `agent`, `system`.

- **user**: authenticated human with a household membership. Role determines what they can do (owner/admin/member/viewer).
- **agent**: the local LLM, identified by an agent user record (`is_agent = true`). Reads `logseq_index` freely; writes only through MCP tools, never directly.
- **system**: automated jobs, migrations, imports.

Every write through the backend:
1. Authenticates the actor and resolves their household.
2. Validates the payload.
3. Checks authorization.
4. Executes in a transaction.
5. Writes an `audit_log` row with a structured diff.

---

## What Was Retired

Phase 2 dropped eleven database tables that Logseq now handles natively: `notes`, `note_links`, `goals`, `todos`, `habits`, `habit_occurrences`, `recipes`, `recipe_ingredients`, `recipe_steps`, `grocery_lists`, `grocery_items`. The `note_type` and `priority_level` Postgres enums went with them.

The corresponding FastAPI domain modules (`notes/`, `goals/`, `todos/`, `habits/`, `recipes/`, `grocery_lists/`) were deleted from the codebase in the same phase.
