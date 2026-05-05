# Architecture

## Overview

`life-dashboard` is a local-first household operating system. The core stack is:

- **Backend**: FastAPI (Python 3.12) with SQLAlchemy 2.0 async and Alembic migrations
- **Frontend**: Next.js 14 (App Router) with Tailwind CSS and shadcn/ui
- **Database**: Postgres today; local-only mode will also support an embedded database (e.g. SQLite)
- **Editor**: BlockNote, embedded in the frontend as the document/notes editing layer
- **AI layer**: local and hosted LLM provider support, accessed through controlled backend APIs

---

## Deployment Modes

The product is designed around three deployment modes that share a common domain model.

### Local-only

One machine, no server required. A household installs the app and uses it immediately — no Docker, no Postgres, no reverse proxy. Local household member profiles replace real accounts. No sync across devices.

The local-only storage target is an embedded database (SQLite or equivalent) bundled with the app. The domain model and service layer must remain compatible with this path even as self-hosted and hosted modes use Postgres.

### Self-hosted

User-owned infrastructure. Postgres as the database, real user accounts, sync across devices. Intended for technical households who want privacy and control. The `infra/` directory contains a Docker Compose example for this mode.

### Hosted

Managed infrastructure. Same product, lower setup friction. The hosted layer is not yet built; the architecture should leave clean seams for it rather than assuming it will never exist.

---

## Domain Model

### Primary entities

| Entity | Description |
|---|---|
| Household | Top-level shared container for all household data |
| Household member | A person represented in the household domain |
| Account | Authentication identity used in self-hosted and hosted modes |
| Local profile | Profile identity used in local-only mode (no account required) |
| Device | A client installation; may eventually participate in sync |
| Role | Authorization level — owner, admin, adult member, child, viewer |
| Assignment | A task, chore, or responsibility linked to a household member |

### Product objects

The system provides structured support for:

- Tasks and chores (with assignment to household members)
- Recurring routines and habits
- Calendar events and schedules
- Notes and documents (rich text via BlockNote)
- Shopping and household lists (grocery, etc.)
- Goals and milestones
- Recipes and meal planning
- Health and activity records
- AI-generated summaries and suggestions

---

## Data Scopes and Privacy

Privacy boundaries are modeled in code, not inferred from UI conventions.

| Scope | Visibility |
|---|---|
| Shared household data | All household members, subject to role rules |
| Personal data | Owning member only, unless explicitly shared |
| Sensitive data | Narrower visibility; extra caution in AI workflows |
| Administrative data | Billing, config, audit — restricted to owners/admins |

**Rules enforced at the service layer:**
1. Personal data is never included in shared household outputs without an explicit share action.
2. Scope filters are applied in backend service code, not only in frontend conditionals.
3. AI workflows that aggregate across scopes must respect the narrowest applicable visibility.

---

## Backend Structure

```
api/src/life_dashboard/
├── core/
│   ├── database.py       # Async engine, session dependency
│   └── settings.py       # Pydantic-settings config
├── auth/
│   ├── dependencies.py   # get_current_user — attaches household_id
│   ├── hashing.py
│   ├── models.py
│   ├── router.py
│   ├── schemas.py
│   ├── service.py        # Bootstrap logic, token management
│   └── tokens.py
└── domains/
    ├── calendar_events/
    ├── contacts/
    ├── documents/        # BlockNote document tree (source_markdown + editor_json)
    ├── goals/
    ├── grocery_lists/
    ├── habits/
    ├── recipes/
    ├── tags/
    ├── todos/
    └── workouts/         # Strength, cardio, HIIT; polymorphic metrics JSONB
```

### Service layer discipline

Each domain follows `models → schemas → service → router`. The service layer (`*/service.py`) imports nothing from FastAPI — only SQLAlchemy and domain types. Both the HTTP routers and the future MCP/AI server call into the same service layer. This keeps domain logic reusable and independently testable.

### Key patterns

- **`lazy="noload"` on all ORM relationships** — prevents `MissingGreenlet` errors in async context. Related data is loaded via explicit bulk queries, not relationship traversal.
- **`model_validate` + `model_copy`** — used to inject bulk-loaded related data (tags, children, etc.) into Pydantic response schemas without triggering lazy loads.
- **True PATCH semantics** — `data.model_fields_set` distinguishes "field not sent" from "field sent as null". Only explicitly included fields are updated.
- **`household_id` on every domain entity** — every root table carries `household_id` and `created_by_user_id`. The `get_current_user` auth dependency attaches `household_id` from `HouseholdMembership` so routers never query the membership table directly.

### Auth

argon2 password hashing, JWT access tokens (15-minute lifetime), httpOnly refresh token cookies with rotation. First-run bootstrap: the default user is seeded with a sentinel password hash (`'!'`) that cannot be matched; on first startup, `BOOTSTRAP_PASSWORD` from the environment is hashed and written, then cleared.

---

## Frontend Structure

```
web/src/
├── app/
│   ├── (auth)/login/         # Login page
│   └── (protected)/          # All authenticated routes
│       ├── layout.tsx         # Shell wrapper
│       ├── page.tsx           # Home dashboard
│       ├── todos/
│       ├── habits/
│       └── ...
├── components/
│   ├── shell/                 # Sidebar, nav, command palette
│   ├── dashboard/             # Dashboard widgets
│   ├── ui/                    # shadcn/ui primitives
│   └── [domain]/              # Domain-specific components
└── lib/
    ├── api/
    │   ├── client.ts          # Typed fetch wrapper
    │   ├── query.ts           # TanStack Query helpers
    │   └── schema.d.ts        # OpenAPI-generated types
    └── auth/
        ├── context.tsx        # Auth provider + useAuth hook
        └── token.ts           # In-memory access token management
```

Navigation sections: Dashboard · Documents · Tasks · Habits · Goals · Kitchen (Recipes + Grocery Lists) · Health (Workouts) · Contacts · Settings.

---

## Database Schema

Alembic manages all schema evolution. Migrations live in `api/migrations/versions/`.

### Conventions

- UUID primary keys (`gen_random_uuid()`)
- `created_at` / `updated_at` timestamptz on every table; `updated_at` maintained by DB trigger
- Cascading FKs for owned children; SET NULL for soft associations
- `household_id` on all root entities; child tables (e.g. `grocery_items`, `recipe_ingredients`) inherit via parent FK
- All enum types created by migrations with `create_type=False` in SQLAlchemy model declarations

### Current tables

| Table | Purpose |
|---|---|
| `households` | Top-level household container |
| `users` | Authenticated identities |
| `household_memberships` | User ↔ household join with role |
| `refresh_tokens` | JWT refresh token store |
| `documents` | BlockNote page tree (source_markdown + editor_json JSONB, parent_id hierarchy) |
| `todos` | Tasks with status, due date, recurrence JSONB, hierarchy |
| `habits` + `habit_occurrences` | Habit definitions and completion log |
| `goals` | Hierarchical goals with progress tracking |
| `recipes` + `recipe_ingredients` + `recipe_steps` | Recipe store |
| `grocery_lists` + `grocery_items` | Shopping lists |
| `workouts` + `exercise_entries` | Workout log; exercise metrics in JSONB (typed by strength/cardio/hiit/etc.) |
| `contacts` + child tables | vCard-compatible contact store |
| `calendar_events` | iCal-compatible events with recurrence |
| `tags` + `taggings` | Normalized polymorphic tag system |
| `attachments` | File reference store |
| `audit_log` | Append-only write log with structured diffs |
| `schema_migrations` | Migration version tracking |

---

## Open-Core Boundary

| Layer | Open core | Premium / hosted |
|---|---|---|
| Household domain model | ✓ | |
| Chores, tasks, habits, goals | ✓ | |
| Document editing (BlockNote) | ✓ | |
| Local-only mode | ✓ | |
| Self-hosted deployment | ✓ | |
| Basic AI / BYOK hooks | ✓ | |
| Managed sync service | | ✓ |
| Hosted infrastructure | | ✓ |
| Polished mobile apps | | ✓ |
| Managed AI credits | | ✓ |
| Premium integrations (operational cost) | | ✓ |

The open core should be genuinely useful — not artificially limited. If a design makes the free/local product feel fake, push back.

---

## AI Layer (Planned — Phase 4)

The AI layer is an augmentation layer, not a source of truth. Architecture principles:

- The LLM never reads the database directly and never writes outside controlled tool boundaries.
- AI tools are defined in `agent/` and call into the same backend service layer as the HTTP API.
- Provider integrations are modular: local LLM (Ollama/LM Studio), BYOK (OpenAI/Anthropic key), and future managed AI credits are all valid configurations.
- Every AI-triggered write produces an `audit_log` row.
- Destructive or bulk AI actions require human approval gates.
