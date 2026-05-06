"""compress pipeline: jobs idempotency, sizes, ratios; storage_objects purpose+confirmed_at

Revision ID: 9f1ad04bc012
Revises: 4c8d9b3e7f01
Create Date: 2026-05-06 17:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9f1ad04bc012"
down_revision: str | None = "4c8d9b3e7f01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("idempotency_key", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("input_size_bytes", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("output_size_bytes", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("compression_ratio", sa.Float(), nullable=True),
    )
    op.create_index(
        "uq_jobs_org_idempotency_active",
        "jobs",
        ["organization_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.add_column(
        "storage_objects",
        sa.Column(
            "purpose",
            sa.String(length=20),
            nullable=False,
            server_default="upload",
        ),
    )
    op.add_column(
        "storage_objects",
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_storage_objects_unconfirmed_created_at",
        "storage_objects",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("confirmed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_storage_objects_unconfirmed_created_at",
        table_name="storage_objects",
    )
    op.drop_column("storage_objects", "confirmed_at")
    op.drop_column("storage_objects", "purpose")

    op.drop_index("uq_jobs_org_idempotency_active", table_name="jobs")
    op.drop_column("jobs", "compression_ratio")
    op.drop_column("jobs", "output_size_bytes")
    op.drop_column("jobs", "input_size_bytes")
    op.drop_column("jobs", "idempotency_key")
