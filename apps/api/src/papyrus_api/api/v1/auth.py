from __future__ import annotations

from fastapi import APIRouter, Cookie, Response, status

from papyrus_api.api.deps import CurrentPrincipal, IdentityServiceDep
from papyrus_api.core.config import settings
from papyrus_api.core.cookies import clear_refresh_cookie, set_refresh_cookie
from papyrus_api.core.errors import AuthenticationError
from papyrus_api.core.security import TokenType, issue_token
from papyrus_api.schemas.identity import (
    AccessToken,
    AuthSession,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenericMessage,
    LoginRequest,
    OrganizationOut,
    ResetPasswordRequest,
    SignupRequest,
    UserOut,
)
from papyrus_api.services.identity_service import AuthResult

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_session(result: AuthResult, response: Response) -> AuthSession:
    set_refresh_cookie(response, result.refresh_token)
    return AuthSession(
        user=UserOut.model_validate(result.user, from_attributes=True),
        organization=OrganizationOut.model_validate(
            result.organization,
            from_attributes=True,
        ),
        access=AccessToken(
            access_token=result.access_token,
            expires_in=result.expires_in,
        ),
    )


@router.post(
    "/signup",
    response_model=AuthSession,
    status_code=status.HTTP_201_CREATED,
)
async def signup(
    payload: SignupRequest,
    response: Response,
    service: IdentityServiceDep,
) -> AuthSession:
    result = await service.signup(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
    )
    return _to_session(result, response)


@router.post("/login", response_model=AuthSession)
async def login(
    payload: LoginRequest,
    response: Response,
    service: IdentityServiceDep,
) -> AuthSession:
    result = await service.login(email=payload.email, password=payload.password)
    return _to_session(result, response)


@router.post("/refresh", response_model=AccessToken)
async def refresh(
    response: Response,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> AccessToken:
    if not refresh_token:
        raise AuthenticationError("Missing refresh cookie.")
    result = await service.refresh(refresh_token=refresh_token)
    set_refresh_cookie(response, result.refresh_token)
    return AccessToken(
        access_token=result.access_token,
        expires_in=result.expires_in,
    )


@router.get("/session", response_model=AuthSession)
async def session(
    response: Response,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> AuthSession:
    if not refresh_token:
        raise AuthenticationError("Missing refresh cookie.")
    result = await service.refresh(refresh_token=refresh_token)
    return _to_session(result, response)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    service: IdentityServiceDep,
) -> ForgotPasswordResponse:
    debug_token = await service.forgot_password(email=payload.email)
    return ForgotPasswordResponse(
        detail="If an account exists for that email, a reset link has been sent.",
        debug_token=debug_token,
    )


@router.post("/reset-password", response_model=GenericMessage)
async def reset_password(
    payload: ResetPasswordRequest,
    service: IdentityServiceDep,
) -> GenericMessage:
    await service.reset_password(token=payload.token, new_password=payload.password)
    return GenericMessage(detail="Password updated. You can now sign in.")


@router.get("/me", response_model=AuthSession)
async def me(principal: CurrentPrincipal) -> AuthSession:
    user, organization = principal
    access = issue_token(
        subject=user.id,
        organization_id=organization.id,
        token_type=TokenType.ACCESS,
    )
    return AuthSession(
        user=UserOut.model_validate(user, from_attributes=True),
        organization=OrganizationOut.model_validate(organization, from_attributes=True),
        access=AccessToken(
            access_token=access,
            expires_in=settings.jwt_access_ttl_seconds,
        ),
    )


@router.post("/logout", response_model=GenericMessage)
async def logout(response: Response) -> GenericMessage:
    clear_refresh_cookie(response)
    return GenericMessage(detail="Logged out.")
