-- =============================================================================
-- Migration 0002 — Revert icon column on documents
-- =============================================================================

BEGIN;

ALTER TABLE documents DROP COLUMN IF EXISTS icon;

COMMIT;
