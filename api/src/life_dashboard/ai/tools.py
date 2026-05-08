"""AI tool definitions and execution.

Each tool corresponds to a database query the AI can trigger. Tools are
household-scoped — the AI can only see data the requesting user can see.

Adding a new tool:
  1. Add an entry to TOOL_DEFINITIONS (Anthropic tool schema).
  2. Add a matching branch in execute_tool().
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Tool definitions (Anthropic format) ──────────────────────────────────────

TOOL_DEFINITIONS: list[dict] = [
    # ── Write tools ───────────────────────────────────────────────────────────
    {
        "name": "create_workout",
        "description": (
            "Create a new workout session with optional exercise entries. "
            "Use when the user asks to log a workout, add exercise data, or migrate "
            "workout history from documents. Include all exercises for a single session "
            "in one call. Always confirm the date, name, and entry count before calling."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workout_date": {
                    "type": "string",
                    "description": "Date of the workout (YYYY-MM-DD).",
                },
                "name": {
                    "type": "string",
                    "description": "Optional session name (e.g. 'Upper A', 'HIT', 'Long run').",
                },
                "notes": {
                    "type": "string",
                    "description": "Optional free-text notes about the session.",
                },
                "entries": {
                    "type": "array",
                    "description": "Exercise entries for this session.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Exercise name.",
                            },
                            "type": {
                                "type": "string",
                                "enum": ["strength", "cardio", "hiit", "flexibility", "other"],
                                "description": "Exercise category.",
                            },
                            "metrics": {
                                "type": "object",
                                "description": (
                                    "Performance data. "
                                    "strength → {sets: [{weight_lbs, reps}]} — one object per set, "
                                    "each with its own weight (in lbs) and rep count. "
                                    "cardio → {duration_minutes, distance_km}; "
                                    "hiit → {duration_minutes}. "
                                    "Preserve per-set data exactly as recorded — do not average or collapse sets."
                                ),
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional notes for this exercise.",
                            },
                        },
                        "required": ["name", "type"],
                    },
                },
            },
            "required": ["workout_date"],
        },
    },
    {
        "name": "delete_workout",
        "description": (
            "Permanently delete a workout session and all its exercise entries. "
            "Use only when the user explicitly asks to remove a workout, "
            "or to undo a workout that was just created incorrectly."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workout_id": {
                    "type": "string",
                    "description": "UUID of the workout to delete.",
                },
            },
            "required": ["workout_id"],
        },
    },
    # ── Read tools ────────────────────────────────────────────────────────────
    {
        "name": "list_workouts",
        "description": (
            "List the user's workout sessions. Use when asked about exercise history, "
            "recent workouts, fitness activity, or training logs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Defaults to 30 days ago if omitted.",
                },
                "to_date": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Defaults to today if omitted.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of workouts to return (default 10, max 50).",
                    "default": 10,
                },
            },
        },
    },
    {
        "name": "list_todos",
        "description": (
            "List the user's tasks and to-dos. Use when asked about tasks, chores, "
            "what needs to be done, or pending work."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "done", "cancelled"],
                    "description": "Filter by status. Omit to return all statuses.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of todos to return (default 20).",
                    "default": 20,
                },
            },
        },
    },
    {
        "name": "list_habits",
        "description": (
            "List the user's tracked habits. Use when asked about habits, routines, "
            "streaks, or recurring behaviours."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "archived"],
                    "description": "Filter by status. Omit to return active habits only.",
                },
                "limit": {"type": "integer", "default": 30},
            },
        },
    },
    {
        "name": "list_goals",
        "description": (
            "List the user's goals. Use when asked about goals, objectives, "
            "milestones, or what they are working towards."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "list_notes",
        "description": (
            "Search or list the user's notes. Use when asked about notes, journal "
            "entries, or written content. Provide a query to search by keyword."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword search across note titles and content.",
                },
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "list_calendar_events",
        "description": (
            "List the user's calendar events. Use when asked about upcoming events, "
            "schedule, appointments, or what is planned."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Defaults to today if omitted.",
                },
                "to_date": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Defaults to 30 days from now if omitted.",
                },
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "list_recipes",
        "description": (
            "Search or list the user's saved recipes. Use when asked about recipes, "
            "meal ideas, or cooking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search by recipe name.",
                },
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "list_contacts",
        "description": (
            "Search or list the household's contacts. Use when asked about people, "
            "addresses, phone numbers, birthdays, or any person in the contacts list."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search by name or organisation.",
                },
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "list_grocery_lists",
        "description": (
            "List the household's grocery lists and their items. Use when asked about "
            "shopping lists, groceries, what needs to be bought, or store runs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "archived"],
                    "description": "Filter by status. Omit to return active lists.",
                },
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "get_documents",
        "description": (
            "Fetch the full content of one or more documents by their IDs. "
            "Use this after list_documents or search_documents has given you document IDs "
            "and you need to read the actual body text. Accepts up to 5 IDs at once."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of document UUIDs to fetch (max 5).",
                },
            },
            "required": ["ids"],
        },
    },
    {
        "name": "list_documents",
        "description": (
            "Browse the user's document library. Returns document titles and structure. "
            "Use when asked to find a document by name or explore what documents exist. "
            "For searching document *content*, use search_documents instead. "
            "Documents are organised in a tree via parent_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Optional filter by title keyword.",
                },
                "limit": {"type": "integer", "default": 50},
            },
        },
    },
    {
        "name": "search_documents",
        "description": (
            "Full-text search across document titles and content. Use when asked for "
            "specific information that might be written in a document — health notes, "
            "workout logs, journal entries, reference material, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword or phrase to search for in document titles and body text.",
                },
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
]


# ── Tool execution ────────────────────────────────────────────────────────────

async def execute_tool(
    db: AsyncSession,
    tool_name: str,
    tool_input: dict,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Dispatch a tool call to the appropriate service and return a JSON-safe dict.

    Results are serialised with json.dumps() and returned to Claude as tool_result.
    Write tools require user_id in addition to household_id.
    """
    try:
        # ── Write tools ───────────────────────────────────────────────────────
        if tool_name == "create_workout":
            return await _create_workout(db, tool_input, household_id, user_id)
        if tool_name == "delete_workout":
            return await _delete_workout(db, tool_input, household_id)
        # ── Read tools ────────────────────────────────────────────────────────
        if tool_name == "list_workouts":
            return await _list_workouts(db, tool_input, household_id)
        if tool_name == "list_todos":
            return await _list_todos(db, tool_input, household_id)
        if tool_name == "list_habits":
            return await _list_habits(db, tool_input, household_id)
        if tool_name == "list_goals":
            return await _list_goals(db, tool_input, household_id)
        if tool_name == "list_notes":
            return await _list_notes(db, tool_input, household_id)
        if tool_name == "list_calendar_events":
            return await _list_calendar_events(db, tool_input, household_id)
        if tool_name == "list_recipes":
            return await _list_recipes(db, tool_input, household_id)
        if tool_name == "list_contacts":
            return await _list_contacts(db, tool_input, household_id)
        if tool_name == "list_grocery_lists":
            return await _list_grocery_lists(db, tool_input, household_id)
        if tool_name == "get_documents":
            return await _get_documents(db, tool_input, household_id)
        if tool_name == "list_documents":
            return await _list_documents(db, tool_input, household_id)
        if tool_name == "search_documents":
            return await _search_documents(db, tool_input, household_id)
        return {"error": f"Unknown tool: {tool_name}"}
    except Exception:
        logger.exception("Tool execution failed: %s", tool_name)
        return {"error": f"Tool '{tool_name}' failed to execute."}


# ── Individual tool handlers ──────────────────────────────────────────────────

async def _create_workout(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.workouts import service as svc
    from life_dashboard.domains.workouts.schemas import ExerciseEntryCreate, WorkoutCreate

    raw_date = inp.get("workout_date")
    if not raw_date:
        return {"error": "workout_date is required"}

    workout_date = _parse_date(raw_date)
    if workout_date is None:
        return {"error": f"Invalid workout_date: {raw_date!r}. Use YYYY-MM-DD."}

    entries: list[ExerciseEntryCreate] = []
    for i, e in enumerate(inp.get("entries", [])):
        try:
            entries.append(
                ExerciseEntryCreate(
                    name=e["name"],
                    type=e["type"],
                    sort_order=i,
                    metrics=e.get("metrics"),
                    notes=e.get("notes"),
                )
            )
        except Exception as exc:
            return {"error": f"Invalid entry at index {i}: {exc}"}

    data = WorkoutCreate(
        workout_date=workout_date,
        name=inp.get("name"),
        notes=inp.get("notes"),
        entries=entries,
    )

    result = await svc.create_workout(db, household_id, user_id, data)
    return {
        "ok": True,
        "id": str(result.id),
        "workout_date": str(result.workout_date),
        "name": result.name,
        "entries_created": len(result.entries),
    }


async def _delete_workout(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.workouts import service as svc

    raw_id = inp.get("workout_id")
    if not raw_id:
        return {"error": "workout_id is required"}

    try:
        workout_id = uuid.UUID(str(raw_id))
    except (ValueError, AttributeError):
        return {"error": f"Invalid workout_id: {raw_id!r}"}

    deleted = await svc.delete_workout(db, workout_id, household_id)
    if not deleted:
        return {"error": "Workout not found or already deleted."}
    return {"ok": True, "deleted_id": str(workout_id)}


async def _list_workouts(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.workouts import service as svc
    from datetime import timedelta

    today = date.today()
    from_date = _parse_date(inp.get("from_date")) or (today - timedelta(days=30))
    to_date = _parse_date(inp.get("to_date")) or today
    limit = min(int(inp.get("limit", 10)), 25)

    result = await svc.list_workouts(
        db, household_id, from_date=from_date, to_date=to_date, limit=limit
    )
    return {
        "total": result.total,
        "workouts": [
            {
                "id": str(w.id),
                "date": str(w.workout_date),
                "name": w.name,
                "notes": _truncate(w.notes, 300),
            }
            for w in result.items
        ],
    }


async def _list_todos(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.todos import service as svc

    status = inp.get("status")
    limit = min(int(inp.get("limit", 20)), 50)

    result = await svc.list_todos(db, household_id, status=status, limit=limit)
    return {
        "total": result.total,
        "todos": [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.status,
                "due_date": str(t.due_date) if t.due_date else None,
                "priority": t.priority,
                "notes": _truncate(t.notes, 200),
            }
            for t in result.items
        ],
    }


async def _list_habits(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.habits import service as svc

    status = inp.get("status", "active")
    limit = min(int(inp.get("limit", 20)), 50)

    result = await svc.list_habits(db, household_id, status=status, limit=limit)
    return {
        "total": result.total,
        "habits": [
            {
                "id": str(h.id),
                "name": h.name,
                "description": _truncate(h.description, 150),
                "frequency": h.frequency,
                "status": h.status,
                "streak": getattr(h, "streak", None),
            }
            for h in result.items
        ],
    }


async def _list_goals(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.goals import service as svc

    limit = min(int(inp.get("limit", 20)), 50)

    result = await svc.list_goals(db, household_id, limit=limit)
    return {
        "total": result.total,
        "goals": [
            {
                "id": str(g.id),
                "title": g.title,
                "description": _truncate(g.description, 200),
                "status": g.status,
                "target_date": str(g.target_date) if g.target_date else None,
            }
            for g in result.items
        ],
    }


async def _list_notes(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.notes import service as svc

    query = inp.get("query") or None
    limit = min(int(inp.get("limit", 10)), 25)

    result = await svc.list_notes(db, household_id, q=query, limit=limit)
    return {
        "total": result.total,
        "notes": [
            {
                "id": str(n.id),
                "title": n.title,
                "updated_at": n.updated_at.isoformat() if n.updated_at else None,
            }
            for n in result.items
        ],
    }


async def _list_calendar_events(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.calendar_events import service as svc
    from datetime import timedelta

    today = date.today()
    from_dt = _parse_datetime(inp.get("from_date")) or datetime(
        today.year, today.month, today.day, tzinfo=timezone.utc
    )
    to_dt = _parse_datetime(inp.get("to_date")) or (from_dt + timedelta(days=30))
    limit = min(int(inp.get("limit", 20)), 100)

    result = await svc.list_events(
        db, household_id, starts_after=from_dt, starts_before=to_dt, limit=limit
    )
    return {
        "total": result.total,
        "events": [
            {
                "id": str(e.id),
                "title": e.title,
                "starts_at": e.starts_at.isoformat() if e.starts_at else None,
                "ends_at": e.ends_at.isoformat() if e.ends_at else None,
                "all_day": e.all_day,
                "location": getattr(e, "location", None),
                "description": getattr(e, "description", None),
            }
            for e in result.items
        ],
    }


async def _list_recipes(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.recipes import service as svc

    query = inp.get("query") or None
    limit = min(int(inp.get("limit", 10)), 50)

    result = await svc.list_recipes(db, household_id, search=query, limit=limit)
    return {
        "total": result.total,
        "recipes": [
            {
                "id": str(r.id),
                "name": r.name,
                "description": r.description,
                "servings": r.servings,
                "prep_time_minutes": getattr(r, "prep_time_minutes", None),
                "cook_time_minutes": getattr(r, "cook_time_minutes", None),
            }
            for r in result.items
        ],
    }


async def _list_contacts(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.contacts import service as svc

    query = inp.get("query") or None
    limit = min(int(inp.get("limit", 20)), 100)

    result = await svc.list_contacts(db, household_id, search=query, limit=limit)
    return {
        "total": result.total,
        "contacts": [
            {
                "id": str(c.id),
                "name": c.display_name or " ".join(filter(None, [c.given_name, c.family_name])),
                "given_name": c.given_name,
                "family_name": c.family_name,
                "organization": c.organization,
                "job_title": c.job_title,
                "birthday": str(c.birthday) if c.birthday else None,
                "anniversary": str(c.anniversary) if c.anniversary else None,
                "notes": _truncate(c.notes, 200),
                "website": c.website,
                "emails": [{"label": e.label, "address": e.address} for e in c.emails],
                "phones": [{"label": p.label, "number": p.number} for p in c.phones],
                "addresses": [
                    {
                        "label": a.label,
                        "street": a.street,
                        "city": a.city,
                        "state": a.state,
                        "postal_code": a.postal_code,
                        "country": a.country,
                    }
                    for a in c.addresses
                ],
            }
            for c in result.items
        ],
    }


async def _list_grocery_lists(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.grocery_lists import service as svc

    status = inp.get("status", "active")
    limit = min(int(inp.get("limit", 10)), 50)

    result = await svc.list_grocery_lists(db, household_id, status=status, limit=limit)
    return {
        "total": result.total,
        "grocery_lists": [
            {
                "id": str(gl.id),
                "name": gl.name,
                "store": gl.store,
                "status": gl.status,
                "items": [
                    {
                        "name": item.name,
                        "quantity": str(item.quantity) if item.quantity is not None else None,
                        "unit": item.unit,
                        "category": item.category,
                        "is_checked": item.is_checked,
                        "notes": item.notes,
                    }
                    for item in gl.items
                ],
            }
            for gl in result.items
        ],
    }


async def _get_documents(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.documents import service as svc

    raw_ids = inp.get("ids", [])
    if not raw_ids:
        return {"error": "ids is required"}

    # Cap at 5 to keep token usage predictable.
    results = []
    for raw_id in raw_ids[:5]:
        try:
            doc_id = uuid.UUID(str(raw_id))
        except (ValueError, AttributeError):
            results.append({"id": str(raw_id), "error": "invalid UUID"})
            continue

        doc = await svc.get_document(db, doc_id, household_id)
        if doc is None:
            results.append({"id": str(doc_id), "error": "not found"})
        else:
            # Prefer source_markdown; fall back to extracting text from editor_json
            # (BlockNote saves content as editor_json when source_markdown isn't sent).
            content = doc.source_markdown or _extract_editor_text(doc.editor_json)
            results.append({
                "id": str(doc.id),
                "title": doc.title,
                "kind": doc.kind if isinstance(doc.kind, str) else doc.kind.value,
                "content": content,
            })

    return {"documents": results}


async def _list_documents(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.documents import service as svc

    query = inp.get("query") or None
    limit = min(int(inp.get("limit", 50)), 200)

    result = await svc.list_documents(db, household_id)

    docs = result.items
    if query:
        q_lower = query.lower()
        docs = [d for d in docs if q_lower in d.title.lower()]
    docs = docs[:limit]

    return {
        "total": len(docs),
        "documents": [
            {
                "id": str(d.id),
                "title": d.title,
                "kind": d.kind if isinstance(d.kind, str) else d.kind.value,
                "parent_id": str(d.parent_id) if d.parent_id else None,
                "description": d.description,
            }
            for d in docs
        ],
    }


async def _search_documents(
    db: AsyncSession,
    inp: dict,
    household_id: uuid.UUID,
) -> dict:
    from life_dashboard.domains.documents import service as svc

    query = inp.get("query", "").strip()
    if not query:
        return {"error": "query is required"}
    limit = min(int(inp.get("limit", 10)), 50)

    result = await svc.search_documents(db, household_id, query, limit=limit)
    return {
        "total": result.total,
        "results": [
            {
                "id": str(r.id),
                "title": r.title,
                "kind": r.kind if isinstance(r.kind, str) else r.kind.value,
                "snippet": r.snippet,
            }
            for r in result.items
        ],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_editor_text(editor_json: dict | list | None) -> str:
    """Extract plain text from BlockNote / ProseMirror editor JSON.

    BlockNote stores documents as a JSON array of block objects.  Each block
    has a ``content`` list of inline nodes (type "text") and a ``children``
    list of nested blocks.  This function walks the tree recursively and
    returns a newline-joined plain-text representation suitable for passing to
    the AI.

    Handles two common top-level shapes:
      - list  — direct BlockNote block array
      - dict  — ProseMirror doc node with a ``content`` key (or similar wrapper)
    """
    if not editor_json:
        return ""

    def _inline_text(inline: dict) -> str:
        if not isinstance(inline, dict):
            return ""
        itype = inline.get("type", "")
        if itype == "text":
            return inline.get("text", "")
        if itype == "link":
            # Link nodes wrap their label in a nested content array.
            return "".join(_inline_text(i) for i in inline.get("content", []))
        return ""

    def _block_lines(block: dict) -> list[str]:
        """Return one or more text lines for a block and its children."""
        if not isinstance(block, dict):
            return []
        btype = block.get("type", "")

        # Inline text for this block
        inline_parts = [_inline_text(i) for i in block.get("content", [])]
        line = "".join(inline_parts).strip()

        # Add a simple prefix for known block types so the AI has structure cues.
        if btype == "heading":
            level = block.get("props", {}).get("level", 1)
            prefix = "#" * int(level) + " "
            line = prefix + line if line else ""
        elif btype in ("bulletListItem", "checkListItem"):
            line = "- " + line if line else ""
        elif btype == "numberedListItem":
            line = "• " + line if line else ""
        elif btype == "table":
            # Tables: render row-by-row; content is a list of tableRow blocks.
            rows = []
            for row in block.get("content", []):
                if isinstance(row, dict) and row.get("type") == "tableRow":
                    cells = []
                    for cell in row.get("content", []):
                        if isinstance(cell, dict):
                            cell_text = "".join(
                                _inline_text(i) for i in cell.get("content", [])
                            )
                            cells.append(cell_text.strip())
                    rows.append(" | ".join(cells))
            return rows

        lines: list[str] = []
        if line:
            lines.append(line)

        # Recurse into children (nested list items, etc.)
        for child in block.get("children", []):
            lines.extend(_block_lines(child))

        return lines

    # Normalise top-level shape.
    if isinstance(editor_json, list):
        blocks = editor_json
    elif isinstance(editor_json, dict):
        blocks = editor_json.get("content") or editor_json.get("blocks") or []
    else:
        return ""

    all_lines: list[str] = []
    for block in blocks:
        all_lines.extend(_block_lines(block))

    return "\n".join(all_lines)


def _truncate(value: str | None, max_chars: int) -> str | None:
    """Trim a free-text field to keep tool results token-efficient."""
    if not value:
        return value
    return value[:max_chars] + "…" if len(value) > max_chars else value


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except (ValueError, TypeError):
        return None


def _parse_datetime(value: str | None) -> datetime | None:
    d = _parse_date(value)
    if d is None:
        return None
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
