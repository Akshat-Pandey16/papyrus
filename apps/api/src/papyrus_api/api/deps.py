from __future__ import annotations

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from papyrus_api.core.errors import AuthenticationError
from papyrus_api.core.security import TokenType, decode_token
from papyrus_api.db.session import get_session
from papyrus_api.domain.identity.models import Organization, User
from papyrus_api.services.identity_service import IdentityService
from sqlalchemy.ext.asyncio import AsyncSession

DbSession = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False)


def get_identity_service(session: DbSession) -> IdentityService:
    return IdentityService(session)


IdentityServiceDep = Annotated[IdentityService, Depends(get_identity_service)]


async def get_current_principal(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    service: IdentityServiceDep,
) -> tuple[User, Organization]:
    if creds is None or not creds.credentials:
        raise AuthenticationError("Missing bearer token.")
    claims = decode_token(creds.credentials, expected_type=TokenType.ACCESS)
    user_id = UUID(claims["sub"])
    user, organization = await service.get_session(user_id=user_id)
    structlog.contextvars.bind_contextvars(
        user_id=str(user.id),
        organization_id=str(organization.id),
    )
    return user, organization


CurrentPrincipal = Annotated[tuple[User, Organization], Depends(get_current_principal)]
