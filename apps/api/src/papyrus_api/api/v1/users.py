from __future__ import annotations

from fastapi import APIRouter
from papyrus_api.api.deps import CurrentPrincipal, IdentityServiceDep
from papyrus_api.schemas.identity import UpdateProfileRequest, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UpdateProfileRequest,
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
) -> UserOut:
    user, _organization = principal
    updated = await service.update_profile(user=user, full_name=payload.full_name)
    return UserOut.model_validate(updated, from_attributes=True)
