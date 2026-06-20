from __future__ import annotations

from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

_NEW_KINDS = (
    "PROTECT",
    "UNLOCK",
    "WATERMARK",
    "PAGE_NUMBERS",
    "CROP",
    "PDF_TO_IMAGES",
    "IMAGES_TO_PDF",
    "EDIT",
)


def upgrade() -> None:
    for value in _NEW_KINDS:
        op.execute(f"ALTER TYPE job_kind ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
