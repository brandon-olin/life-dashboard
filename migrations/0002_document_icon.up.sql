-- =============================================================================
-- Migration 0002 — Add icon column to documents
-- =============================================================================
-- Adds a nullable text column `icon` to the documents table.
-- Intended to store an emoji character or short string representing the page icon.
-- Safe to run on a populated database — existing rows default to NULL.
-- =============================================================================

BEGIN;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS icon TEXT;

COMMIT;
