from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from papyrus_api.core.security import (
    TokenType,
    decode_token,
    hash_password,
    issue_token,
    needs_rehash,
    verify_password,
)
from papyrus_api.core.time import utc_now
from papyrus_api.domain.identity.enums import MembershipRole
from papyrus_api.domain.identity.models import Organization, User
from papyrus_api.repositories.users import (
    MembershipRepository,
    OrganizationRepository,
    PasswordResetTokenRepository,
    UserRepository,
)

log = structlog.get_logger(__name__)

_RESET_TOKEN_TTL = timedelta(minutes=30)
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_SLUG_COLLISION_RETRIES = 8


def _slugify(value: str) -> str:
    base = _SLUG_RE.sub("-", value.lower()).strip("-")
    return base or "workspace"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(slots=True)
class AuthResult:
    user: User
    organization: Organization
    access_token: str
    refresh_token: str
    expires_in: int


class IdentityService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.organizations = OrganizationRepository(session)
        self.memberships = MembershipRepository(session)
        self.reset_tokens = PasswordResetTokenRepository(session)

    async def signup(
        self,
        *,
        email: str,
        password: str,
        full_name: str | None,
    ) -> AuthResult:
        email_norm = email.strip().lower()
        existing = await self.users.get_by_email(email_norm)
        if existing is not None:
            raise ConflictError(
                "An account with this email already exists.",
                details={"field": "email"},
            )

        user = await self.users.create(
            email=email_norm,
            password_hash=hash_password(password),
            full_name=full_name.strip() if full_name else None,
        )

        org_name = full_name.strip() if full_name else email_norm.split("@", 1)[0]
        slug = await self._unique_org_slug(org_name)
        organization = await self.organizations.create(
            name=f"{org_name}'s workspace",
            slug=slug,
        )
        await self.memberships.create(
            user_id=user.id,
            organization_id=organization.id,
            role=MembershipRole.OWNER,
        )

        await self.session.commit()
        log.info("auth.signup", user_id=str(user.id), organization_id=str(organization.id))
        return self._issue_tokens(user, organization)

    async def login(self, *, email: str, password: str) -> AuthResult:
        email_norm = email.strip().lower()
        user = await self.users.get_by_email(email_norm)
        if user is None or not user.is_active:
            raise AuthenticationError("Invalid email or password.")
        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password.")

        if needs_rehash(user.password_hash):
            await self.users.update_password(user, password_hash=hash_password(password))

        organization = await self.organizations.get_primary_for_user(user.id)
        if organization is None:
            raise AuthenticationError("Account is missing a workspace. Contact support.")

        await self.session.commit()
        log.info("auth.login", user_id=str(user.id))
        return self._issue_tokens(user, organization)

    async def refresh(self, *, refresh_token: str) -> AuthResult:
        claims = decode_token(refresh_token, expected_type=TokenType.REFRESH)
        user_id = UUID(claims["sub"])
        user = await self.users.get(user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is no longer active.")
        organization = await self.organizations.get_primary_for_user(user.id)
        if organization is None:
            raise AuthenticationError("Account is missing a workspace.")
        return self._issue_tokens(user, organization)

    async def forgot_password(self, *, email: str) -> str | None:
        email_norm = email.strip().lower()
        user = await self.users.get_by_email(email_norm)
        if user is None:
            log.info("auth.forgot.unknown_email")
            return None

        raw_token = secrets.token_urlsafe(48)
        await self.reset_tokens.create(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=utc_now() + _RESET_TOKEN_TTL,
        )
        await self.session.commit()
        log.info("auth.forgot.token_issued", user_id=str(user.id))
        return raw_token if settings.is_development else None

    async def reset_password(self, *, token: str, new_password: str) -> None:
        record = await self.reset_tokens.get_active_by_hash(_hash_token(token))
        if record is None:
            raise ValidationError(
                "This reset link is invalid or has expired.",
                details={"field": "token"},
            )
        user = await self.users.get(record.user_id)
        if user is None:
            raise NotFoundError("User no longer exists.")
        await self.users.update_password(user, password_hash=hash_password(new_password))
        await self.reset_tokens.mark_used(record)
        await self.session.commit()
        log.info("auth.reset_password", user_id=str(user.id))

    async def get_session(self, *, user_id: UUID) -> tuple[User, Organization]:
        user = await self.users.get(user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is no longer active.")
        organization = await self.organizations.get_primary_for_user(user.id)
        if organization is None:
            raise AuthenticationError("Account is missing a workspace.")
        return user, organization

    async def _unique_org_slug(self, base: str) -> str:
        candidate = _slugify(base)
        suffix = 0
        while await self.organizations.get_by_slug(candidate) is not None:
            suffix += 1
            candidate = f"{_slugify(base)}-{secrets.token_hex(2)}"
            if suffix > _SLUG_COLLISION_RETRIES:
                candidate = f"workspace-{secrets.token_hex(4)}"
                break
        return candidate

    def _issue_tokens(self, user: User, organization: Organization) -> AuthResult:
        access = issue_token(
            subject=user.id,
            organization_id=organization.id,
            token_type=TokenType.ACCESS,
        )
        refresh = issue_token(
            subject=user.id,
            organization_id=organization.id,
            token_type=TokenType.REFRESH,
        )
        return AuthResult(
            user=user,
            organization=organization,
            access_token=access,
            refresh_token=refresh,
            expires_in=settings.jwt_access_ttl_seconds,
        )
