from __future__ import annotations

from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None

_NEW_KINDS = ("NUP",)


def upgrade() -> None:
    for value in _NEW_KINDS:
        op.execute(f"ALTER TYPE job_kind ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
