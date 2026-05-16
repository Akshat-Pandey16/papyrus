from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Cookie, Request, Response, status

from papyrus_api.api.deps import CurrentPrincipal, IdentityServiceDep, rate_limit
from papyrus_api.core.config import settings
from papyrus_api.core.cookies import clear_refresh_cookie, set_refresh_cookie
from papyrus_api.core.errors import AuthenticationError
from papyrus_api.core.security import issue_access_token
from papyrus_api.schemas.identity import (
    AccessToken,
    AuthSession,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenericMessage,
    LoginRequest,
    OrganizationOut,
    ResetPasswordRequest,
    SessionOut,
    SessionsList,
    SignupRequest,
    UserOut,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from papyrus_api.services.identity_service import AuthResult, ClientContext

router = APIRouter(prefix="/auth", tags=["auth"])


def _client(request: Request) -> ClientContext:
    ua = request.headers.get("user-agent")
    forwarded = request.headers.get("x-forwarded-for")
    ip = (
        forwarded.split(",", 1)[0].strip()
        if forwarded
        else (request.client.host if request.client else None)
    )
    return ClientContext(
        user_agent=ua[:255] if ua else None,
        ip_address=ip[:64] if ip else None,
    )


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
    dependencies=[rate_limit("auth.signup", limit=10, window_seconds=3600)],
)
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    service: IdentityServiceDep,
) -> AuthSession:
    result = await service.signup(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        client=_client(request),
    )
    return _to_session(result, response)


@router.post(
    "/login",
    response_model=AuthSession,
    dependencies=[rate_limit("auth.login", limit=20, window_seconds=300)],
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    service: IdentityServiceDep,
) -> AuthSession:
    result = await service.login(
        email=payload.email,
        password=payload.password,
        client=_client(request),
    )
    return _to_session(result, response)


@router.post(
    "/refresh",
    response_model=AccessToken,
    dependencies=[rate_limit("auth.refresh", limit=120, window_seconds=300)],
)
async def refresh(
    request: Request,
    response: Response,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> AccessToken:
    if not refresh_token:
        raise AuthenticationError("Missing refresh cookie.")
    try:
        result = await service.refresh(
            refresh_token=refresh_token,
            client=_client(request),
        )
    except AuthenticationError:
        clear_refresh_cookie(response)
        raise
    set_refresh_cookie(response, result.refresh_token)
    return AccessToken(
        access_token=result.access_token,
        expires_in=result.expires_in,
    )


@router.get("/session", response_model=AuthSession)
async def session(
    request: Request,
    response: Response,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> AuthSession:
    if not refresh_token:
        raise AuthenticationError("Missing refresh cookie.")
    try:
        result = await service.refresh(
            refresh_token=refresh_token,
            client=_client(request),
        )
    except AuthenticationError:
        clear_refresh_cookie(response)
        raise
    return _to_session(result, response)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    dependencies=[rate_limit("auth.forgot", limit=5, window_seconds=3600)],
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    service: IdentityServiceDep,
) -> ForgotPasswordResponse:
    debug_token = await service.forgot_password(email=payload.email)
    return ForgotPasswordResponse(
        detail="If an account exists for that email, a reset link has been sent.",
        debug_token=debug_token,
    )


@router.post(
    "/reset-password",
    response_model=GenericMessage,
    dependencies=[rate_limit("auth.reset", limit=10, window_seconds=3600)],
)
async def reset_password(
    payload: ResetPasswordRequest,
    service: IdentityServiceDep,
) -> GenericMessage:
    await service.reset_password(token=payload.token, new_password=payload.password)
    return GenericMessage(detail="Password updated. You can now sign in.")


@router.get("/me", response_model=AuthSession)
async def me(principal: CurrentPrincipal) -> AuthSession:
    user, organization = principal
    access = issue_access_token(
        subject=user.id,
        organization_id=organization.id,
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
async def logout(
    response: Response,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> GenericMessage:
    await service.logout(refresh_token=refresh_token)
    clear_refresh_cookie(response)
    return GenericMessage(detail="Logged out.")


@router.post(
    "/change-password",
    response_model=GenericMessage,
    dependencies=[rate_limit("auth.change_password", limit=10, window_seconds=3600)],
)
async def change_password(
    payload: ChangePasswordRequest,
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> GenericMessage:
    user, _organization = principal
    await service.change_password(
        user=user,
        current_password=payload.current_password,
        new_password=payload.password,
        keep_refresh_token=refresh_token,
    )
    return GenericMessage(detail="Password updated. Other sessions have been signed out.")


@router.get("/sessions", response_model=SessionsList)
async def list_sessions(
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> SessionsList:
    user, _organization = principal
    rows = await service.list_sessions(
        user_id=user.id,
        current_refresh_token=refresh_token,
    )
    items = [
        SessionOut(
            id=row[0],
            created_at=row[1],
            expires_at=row[2],
            user_agent=row[3],
            ip_address=row[4],
            current=row[5],
        )
        for row in rows
    ]
    return SessionsList(items=items)


@router.delete("/sessions/{session_id}", response_model=GenericMessage)
async def revoke_session(
    session_id: UUID,
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
) -> GenericMessage:
    user, _organization = principal
    await service.revoke_session(user_id=user.id, session_id=session_id)
    return GenericMessage(detail="Session revoked.")


@router.post("/sessions/revoke-others", response_model=GenericMessage)
async def revoke_other_sessions(
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> GenericMessage:
    user, _organization = principal
    revoked = await service.revoke_other_sessions(
        user_id=user.id,
        keep_refresh_token=refresh_token,
    )
    return GenericMessage(detail=f"{revoked} other session(s) signed out.")


@router.post(
    "/verify-email/request",
    response_model=VerifyEmailResponse,
    dependencies=[rate_limit("auth.verify_email_request", limit=5, window_seconds=3600)],
)
async def request_email_verification(
    principal: CurrentPrincipal,
    service: IdentityServiceDep,
) -> VerifyEmailResponse:
    user, _organization = principal
    debug_token = await service.request_email_verification(user=user)
    return VerifyEmailResponse(
        detail="If your email is unverified, a verification link has been sent.",
        debug_token=debug_token,
    )


@router.post(
    "/verify-email/confirm",
    response_model=GenericMessage,
    dependencies=[rate_limit("auth.verify_email_confirm", limit=10, window_seconds=3600)],
)
async def confirm_email_verification(
    payload: VerifyEmailRequest,
    service: IdentityServiceDep,
) -> GenericMessage:
    await service.confirm_email_verification(token=payload.token)
    return GenericMessage(detail="Email verified.")
