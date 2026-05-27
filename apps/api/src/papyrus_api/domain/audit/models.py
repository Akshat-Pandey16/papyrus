from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, TimestampMixin


class AuditEvent(Base, IdMixin, TimestampMixin):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_organization_id_created_at", "organization_id", "created_at"),
        Index("ix_audit_events_actor_user_id_created_at", "actor_user_id", "created_at"),
    )

    action: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(default=None, nullable=True)
    organization_id: Mapped[UUID | None] = mapped_column(default=None, nullable=True)
    target_type: Mapped[str | None] = mapped_column(String(40), default=None, nullable=True)
    target_id: Mapped[UUID | None] = mapped_column(default=None, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), default=None, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), default=None, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
