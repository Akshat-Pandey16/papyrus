from __future__ import annotations

from typing import Any
from uuid import UUID

from papyrus_api.domain.audit.models import AuditEvent
from papyrus_api.repositories.base import AsyncRepository


class AuditEventRepository(AsyncRepository[AuditEvent]):
    model = AuditEvent

    async def record(
        self,
        *,
        action: str,
        actor_user_id: UUID | None = None,
        organization_id: UUID | None = None,
        target_type: str | None = None,
        target_id: UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            action=action,
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            user_agent=user_agent,
            payload=payload or {},
        )
        self.session.add(event)
        await self.session.flush()
        return event
