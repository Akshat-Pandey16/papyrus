"""perf: tenant-scoped composite + partial indexes across domain tables

Revision ID: 4c8d9b3e7f01
Revises: 7a2c4f51e9a1
Create Date: 2026-05-06 15:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4c8d9b3e7f01"
down_revision: str | None = "7a2c4f51e9a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        "ix_password_reset_tokens_user_id_used_at",
        table_name="password_reset_tokens",
    )
    op.drop_index(op.f("ix_users_created_at"), table_name="users")

    op.create_index(
        "ix_password_reset_tokens_active",
        "password_reset_tokens",
        ["token_hash"],
        unique=False,
        postgresql_where=sa.text("used_at IS NULL"),
    )

    op.create_index(
        "ix_api_keys_prefix_active",
        "api_keys",
        ["prefix"],
        unique=False,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "ix_api_keys_organization_id_revoked_at",
        "api_keys",
        ["organization_id", "revoked_at"],
        unique=False,
    )

    op.create_index(
        "ix_documents_organization_id_created_at",
        "documents",
        ["organization_id", "created_at"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_unique_constraint(
        op.f("uq_document_versions_document_id_version"),
        "document_versions",
        ["document_id", "version"],
    )
    op.create_index(
        op.f("ix_document_versions_storage_object_id"),
        "document_versions",
        ["storage_object_id"],
        unique=False,
    )

    op.create_index(
        "ix_jobs_organization_id_created_at",
        "jobs",
        ["organization_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_jobs_organization_id_status",
        "jobs",
        ["organization_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_jobs_pending_runnable",
        "jobs",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("status IN ('PENDING', 'RUNNING')"),
    )
    op.create_index(
        op.f("ix_jobs_output_object_id"),
        "jobs",
        ["output_object_id"],
        unique=False,
    )

    op.create_index(
        "ix_job_events_job_id_created_at",
        "job_events",
        ["job_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_job_events_job_id_created_at", table_name="job_events")
    op.drop_index(op.f("ix_jobs_output_object_id"), table_name="jobs")
    op.drop_index("ix_jobs_pending_runnable", table_name="jobs")
    op.drop_index("ix_jobs_organization_id_status", table_name="jobs")
    op.drop_index("ix_jobs_organization_id_created_at", table_name="jobs")
    op.drop_index(
        op.f("ix_document_versions_storage_object_id"),
        table_name="document_versions",
    )
    op.drop_constraint(
        op.f("uq_document_versions_document_id_version"),
        "document_versions",
        type_="unique",
    )
    op.drop_index("ix_documents_organization_id_created_at", table_name="documents")
    op.drop_index("ix_api_keys_organization_id_revoked_at", table_name="api_keys")
    op.drop_index("ix_api_keys_prefix_active", table_name="api_keys")
    op.drop_index("ix_password_reset_tokens_active", table_name="password_reset_tokens")

    op.create_index(
        op.f("ix_users_created_at"),
        "users",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_password_reset_tokens_user_id_used_at",
        "password_reset_tokens",
        ["user_id", "used_at"],
        unique=False,
    )
