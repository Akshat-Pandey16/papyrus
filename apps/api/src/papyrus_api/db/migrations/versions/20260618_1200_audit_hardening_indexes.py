"""perf+hardening: cleanup-sweep and keyset indexes; drop dead audit action index

Revision ID: a1b2c3d4e5f6
Revises: f3a8c1d92b40
Create Date: 2026-06-18 12:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f3a8c1d92b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_storage_objects_purpose_created_at "
        "ON storage_objects (purpose, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_documents_created_at_active "
        "ON documents (created_at) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_jobs_org_status_created_id "
        "ON jobs (organization_id, status, created_at, id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at "
        "ON refresh_tokens (expires_at)"
    )
    op.execute("DROP INDEX IF EXISTS ix_audit_events_action")


def downgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_events_action ON audit_events (action)"
    )
    op.execute("DROP INDEX IF EXISTS ix_refresh_tokens_expires_at")
    op.execute("DROP INDEX IF EXISTS ix_jobs_org_status_created_id")
    op.execute("DROP INDEX IF EXISTS ix_documents_created_at_active")
    op.execute("DROP INDEX IF EXISTS ix_storage_objects_purpose_created_at")
