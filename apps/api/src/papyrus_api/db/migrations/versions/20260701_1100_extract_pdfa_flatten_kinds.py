from __future__ import annotations

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

_NEW_KINDS = (
    "EXTRACT_TEXT",
    "PDFA",
    "FLATTEN",
)


def upgrade() -> None:
    for value in _NEW_KINDS:
        op.execute(f"ALTER TYPE job_kind ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
