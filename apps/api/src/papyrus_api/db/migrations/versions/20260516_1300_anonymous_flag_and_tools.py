"""anonymous flag on users/orgs + new pdf tool job kinds

Revision ID: c3e1f2a8b4f5
Revises: b2d8f1c33203
Create Date: 2026-05-16 13:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3e1f2a8b4f5"
down_revision: str | None = "b2d8f1c33203"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_anonymous",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "is_anonymous",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_users_anonymous_created_at",
        "users",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("is_anonymous = true"),
    )
    op.create_index(
        "ix_organizations_anonymous_created_at",
        "organizations",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("is_anonymous = true"),
    )


def downgrade() -> None:
    op.drop_index("ix_organizations_anonymous_created_at", table_name="organizations")
    op.drop_index("ix_users_anonymous_created_at", table_name="users")
    op.drop_column("organizations", "is_anonymous")
    op.drop_column("users", "is_anonymous")
