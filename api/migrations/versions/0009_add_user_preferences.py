"""add user preferences jsonb

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-06

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferences", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferences")
