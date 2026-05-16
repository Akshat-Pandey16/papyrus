"""storage_objects: link to document for fast unconfirmed lookup

Revision ID: b2d8f1c33203
Revises: a1c7e9b21102
Create Date: 2026-05-16 11:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2d8f1c33203"
down_revision: str | None = "a1c7e9b21102"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "storage_objects",
        sa.Column("document_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_storage_objects_documents_document_id"),
        "storage_objects",
        "documents",
        ["document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_storage_objects_document_unconfirmed",
        "storage_objects",
        ["document_id", "created_at"],
        unique=False,
        postgresql_where=sa.text("confirmed_at IS NULL AND document_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_storage_objects_document_unconfirmed",
        table_name="storage_objects",
    )
    op.drop_constraint(
        op.f("fk_storage_objects_documents_document_id"),
        "storage_objects",
        type_="foreignkey",
    )
    op.drop_column("storage_objects", "document_id")
