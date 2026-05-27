"""password_reset_tokens: add purpose to separate reset vs email-verification

Revision ID: d4f0a6b71e08
Revises: c3e1f2a8b4f5
Create Date: 2026-05-27 10:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4f0a6b71e08"
down_revision: str | None = "c3e1f2a8b4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "password_reset_tokens",
        sa.Column(
            "purpose",
            sa.String(length=20),
            nullable=False,
            server_default="reset",
        ),
    )
    op.alter_column("password_reset_tokens", "purpose", server_default=None)
    op.create_index(
        "ix_password_reset_tokens_user_purpose_active",
        "password_reset_tokens",
        ["user_id", "purpose"],
        unique=False,
        postgresql_where=sa.text("used_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_password_reset_tokens_user_purpose_active",
        table_name="password_reset_tokens",
    )
    op.drop_column("password_reset_tokens", "purpose")
