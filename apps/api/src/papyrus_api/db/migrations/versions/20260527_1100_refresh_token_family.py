"""refresh_tokens: add family_id for single-statement family revocation

Revision ID: e7b2c9d41a3f
Revises: d4f0a6b71e08
Create Date: 2026-05-27 11:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7b2c9d41a3f"
down_revision: str | None = "d4f0a6b71e08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("family_id", sa.Uuid(), nullable=True))
    op.execute("UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.create_index(
        "ix_refresh_tokens_family_active",
        "refresh_tokens",
        ["family_id"],
        unique=False,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_family_active", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
