"""add notes domain (notes, note_tags, note_backlinks)

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-07

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notes ─────────────────────────────────────────────────────────────────
    op.create_table(
        "notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content_md", sa.Text(), nullable=True),
        sa.Column("content_json", JSONB(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notes_household_id", "notes", ["household_id"])
    op.create_index("ix_notes_updated_at", "notes", ["updated_at"])

    # ── note_tags ─────────────────────────────────────────────────────────────
    op.create_table(
        "note_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("note_id", UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", UUID(as_uuid=True), sa.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("note_id", "tag_id", name="note_tags_note_tag_key"),
    )

    # ── note_backlinks ────────────────────────────────────────────────────────
    op.create_table(
        "note_backlinks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_note_id", UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_note_id", UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source_note_id", "target_note_id", name="note_backlinks_pair_key"),
    )
    op.create_index("ix_note_backlinks_target", "note_backlinks", ["target_note_id"])


def downgrade() -> None:
    op.drop_table("note_backlinks")
    op.drop_table("note_tags")
    op.drop_table("notes")
