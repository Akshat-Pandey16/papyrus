from __future__ import annotations

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None

_NEW_KINDS = (
    "REPAIR",
    "GRAYSCALE",
)


def upgrade() -> None:
    for value in _NEW_KINDS:
        op.execute(f"ALTER TYPE job_kind ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
