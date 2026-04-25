# life_dashboard

Local-first life-management system for the household. All data lives in a
self-hosted Postgres on the NAS; a local LLM on a gaming PC drives
automation; a web UI on the NAS is the day-to-day interface.

## Repo layout

```
life-dashboard/
├── api/                # FastAPI backend (Python) — Phase 1
├── web/                # Next.js frontend — Phase 2
├── agent/              # Local LLM client — Phase 3
├── integrations/
│   └── home_assistant/ # Future HA custom integration — Phase 4
├── infra/              # docker-compose fragment + Caddy config
├── migrations/         # Alembic-compatible SQL migrations
└── docs/               # Architecture, runbook, agent vocabulary
```

## Phase map

| Phase | Status | What |
|---|---|---|
| 0 | **in progress** | Schema migration: multi-user, audit, tags, attachments |
| 1 | pending | FastAPI backend with CRUD + auth + audit middleware |
| 2 | pending | Next.js frontend with typed API client |
| 3 | pending | Local LLM agent + MCP server + action vocabulary |
| 4 | future | Home Assistant integration (MQTT + custom component) |

## Architecture summary

- **Database**: existing Postgres 16 in the `postgres-1` container on the NAS.
- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Alembic. Service layer is
  FastAPI-free so it can be reused by the MCP server and potentially by an
  HA custom integration.
- **Frontend**: Next.js App Router, Tailwind + shadcn/ui, typed API client
  generated from the backend's OpenAPI schema.
- **Agent**: runs on the gaming PC, connects to the backend's MCP server
  over the LAN / Tailscale. Read-first, then controlled writes with audit,
  then approval-gated destructive ops.
- **Access from phones**: responsive web over Tailscale. Native apps and
  offline sync are deliberately deferred.

See `docs/architecture.md` for the long version and `docs/runbook.md` for
operational procedures.

## Current next step

Apply the Phase-0 migration (`migrations/0001_*.up.sql`) to the
`life_dashboard` database on the NAS. Full procedure in `docs/runbook.md`.
# life-dashboard
