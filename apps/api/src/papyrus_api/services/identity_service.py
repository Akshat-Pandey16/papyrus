from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import structlog
from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from papyrus_api.core.security import (
    hash_opaque_token,
    hash_password,
    issue_access_token,
    needs_rehash,
    new_opaque_token,
    verify_password,
)
from papyrus_api.core.time import utc_now
from papyrus_api.domain.identity.enums import MembershipRole
from papyrus_api.domain.identity.models import Organization, RefreshToken, User
from papyrus_api.repositories.users import (
    MembershipRepository,
    OrganizationRepository,
    PasswordResetTokenRepository,
    RefreshTokenRepository,
    UserRepository,
)
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)

_RESET_TOKEN_TTL = timedelta(minutes=30)
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_SLUG_COLLISION_RETRIES = 8


def _slugify(value: str) -> str:
    base = _SLUG_RE.sub("-", value.lower()).strip("-")
    return base or "workspace"


@dataclass(slots=True)
class AuthResult:
    user: User
    organization: Organization
    access_token: str
    refresh_token: str
    expires_in: int


@dataclass(slots=True, frozen=True)
class ClientContext:
    user_agent: str | None = None
    ip_address: str | None = None


class IdentityService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.organizations = OrganizationRepository(session)
        self.memberships = MembershipRepository(session)
        self.reset_tokens = PasswordResetTokenRepository(session)
        self.refresh_tokens = RefreshTokenRepository(session)

    async def create_anonymous(self, *, client: ClientContext | None = None) -> AuthResult:
        anon_id = secrets.token_hex(12)
        email = f"anon+{anon_id}@papyrus.local"
        user = await self.users.create(
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            full_name=None,
        )
        user.is_anonymous = True
        organization = await self.organizations.create(
            name="Anonymous workspace",
            slug=f"anon-{anon_id}",
        )
        organization.is_anonymous = True
        await self.memberships.create(
            user_id=user.id,
            organization_id=organization.id,
            role=MembershipRole.OWNER,
        )
        await self.session.flush()
        result = await self._issue_tokens(user, organization, client=client, parent=None)
        await self.session.commit()
        log.info(
            "auth.anonymous.created",
            user_id=str(user.id),
            organization_id=str(organization.id),
        )
        return result

    async def signup(
        self,
        *,
        email: str,
        password: str,
        full_name: str | None,
        client: ClientContext | None = None,
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

        result = await self._issue_tokens(user, organization, client=client, parent=None)
        await self.session.commit()
        log.info("auth.signup", user_id=str(user.id), organization_id=str(organization.id))
        return result

    async def login(
        self,
        *,
        email: str,
        password: str,
        client: ClientContext | None = None,
    ) -> AuthResult:
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

        result = await self._issue_tokens(user, organization, client=client, parent=None)
        await self.session.commit()
        log.info("auth.login", user_id=str(user.id))
        return result

    async def refresh(
        self,
        *,
        refresh_token: str,
        client: ClientContext | None = None,
    ) -> AuthResult:
        if not refresh_token:
            raise AuthenticationError("Missing refresh token.")
        record = await self.refresh_tokens.get_by_hash(hash_opaque_token(refresh_token))
        if record is None:
            raise AuthenticationError("Invalid refresh token.")

        now = utc_now()
        absolute_cutoff = now - timedelta(seconds=settings.refresh_absolute_ttl_seconds)
        if record.created_at < absolute_cutoff:
            await self.refresh_tokens.revoke_all_for_user(record.user_id)
            await self.session.commit()
            raise AuthenticationError("Session expired. Please sign in again.")

        if record.revoked_at is not None:
            root_id = await self.refresh_tokens.find_root_ancestor(record)
            await self.refresh_tokens.revoke_chain(root_id)
            await self.session.commit()
            log.warning(
                "auth.refresh.reuse_detected",
                user_id=str(record.user_id),
                token_id=str(record.id),
            )
            raise AuthenticationError("Refresh token replay detected. Please sign in again.")

        if record.expires_at <= now:
            await self.refresh_tokens.revoke(record)
            await self.session.commit()
            raise AuthenticationError("Session expired. Please sign in again.")

        user = await self.users.get(record.user_id)
        if user is None or not user.is_active:
            await self.refresh_tokens.revoke_all_for_user(record.user_id)
            await self.session.commit()
            raise AuthenticationError("Account is no longer active.")

        organization = await self.organizations.get(record.organization_id)
        if organization is None:
            await self.refresh_tokens.revoke_all_for_user(user.id)
            await self.session.commit()
            raise AuthenticationError("Account is missing a workspace.")

        await self.refresh_tokens.revoke(record)
        result = await self._issue_tokens(user, organization, client=client, parent=record.id)
        await self.session.commit()
        return result

    async def logout(self, *, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        record = await self.refresh_tokens.get_by_hash(hash_opaque_token(refresh_token))
        if record is None:
            return
        await self.refresh_tokens.revoke(record)
        await self.session.commit()

    async def forgot_password(self, *, email: str) -> str | None:
        email_norm = email.strip().lower()
        user = await self.users.get_by_email(email_norm)
        if user is None:
            log.info("auth.forgot.unknown_email")
            return None

        await self.reset_tokens.revoke_all_for_user(user.id)
        raw_token = secrets.token_urlsafe(48)
        await self.reset_tokens.create(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=utc_now() + _RESET_TOKEN_TTL,
        )
        await self.session.commit()
        log.info("auth.forgot.token_issued", user_id=str(user.id))
        return raw_token if settings.is_development else None

    async def reset_password(self, *, token: str, new_password: str) -> None:
        record = await self.reset_tokens.get_active_by_hash(hash_opaque_token(token))
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
        await self.refresh_tokens.revoke_all_for_user(user.id)
        await self.session.commit()
        log.info("auth.reset_password", user_id=str(user.id))

    async def change_password(
        self,
        *,
        user: User,
        current_password: str,
        new_password: str,
        keep_refresh_token: str | None,
    ) -> None:
        if not verify_password(current_password, user.password_hash):
            raise AuthenticationError("Current password is incorrect.")
        await self.users.update_password(user, password_hash=hash_password(new_password))

        keep_id: UUID | None = None
        if keep_refresh_token:
            record = await self.refresh_tokens.get_by_hash(hash_opaque_token(keep_refresh_token))
            if record is not None and record.revoked_at is None:
                keep_id = record.id
        await self._revoke_other_sessions(user_id=user.id, keep_id=keep_id)
        await self.session.commit()
        log.info("auth.password_changed", user_id=str(user.id))

    async def update_profile(self, *, user: User, full_name: str | None) -> User:
        user.full_name = full_name.strip() if full_name else None
        await self.session.flush()
        await self.session.commit()
        return user

    async def list_sessions(
        self,
        *,
        user_id: UUID,
        current_refresh_token: str | None,
    ) -> list[tuple[UUID, datetime, datetime, str | None, str | None, bool]]:
        records = await self.refresh_tokens.list_active_for_user(user_id=user_id)
        current_id: UUID | None = None
        if current_refresh_token:
            record = await self.refresh_tokens.get_by_hash(
                hash_opaque_token(current_refresh_token),
            )
            if record is not None and record.revoked_at is None:
                current_id = record.id
        return [
            (
                r.id,
                r.created_at,
                r.expires_at,
                r.user_agent,
                r.ip_address,
                r.id == current_id,
            )
            for r in records
        ]

    async def revoke_session(self, *, user_id: UUID, session_id: UUID) -> None:
        record = await self.refresh_tokens.get(session_id)
        if record is None or record.user_id != user_id:
            raise NotFoundError("Session not found.")
        await self.refresh_tokens.revoke(record)
        await self.session.commit()

    async def revoke_other_sessions(
        self,
        *,
        user_id: UUID,
        keep_refresh_token: str | None,
    ) -> int:
        keep_id: UUID | None = None
        if keep_refresh_token:
            record = await self.refresh_tokens.get_by_hash(hash_opaque_token(keep_refresh_token))
            if record is not None and record.revoked_at is None:
                keep_id = record.id
        revoked = await self._revoke_other_sessions(user_id=user_id, keep_id=keep_id)
        await self.session.commit()
        return revoked

    async def _revoke_other_sessions(self, *, user_id: UUID, keep_id: UUID | None) -> int:
        return await self.refresh_tokens.revoke_others_for_user(
            user_id=user_id,
            keep_id=keep_id,
        )

    async def request_email_verification(self, *, user: User) -> str | None:
        if user.email_verified_at is not None:
            return None
        await self.reset_tokens.revoke_all_for_user(user.id)
        raw_token = secrets.token_urlsafe(48)
        await self.reset_tokens.create(
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=utc_now() + timedelta(hours=24),
        )
        await self.session.commit()
        log.info("auth.verify_email.token_issued", user_id=str(user.id))
        return raw_token if settings.is_development else None

    async def confirm_email_verification(self, *, token: str) -> User:
        record = await self.reset_tokens.get_active_by_hash(hash_opaque_token(token))
        if record is None:
            raise ValidationError(
                "This verification link is invalid or has expired.",
                details={"field": "token"},
            )
        user = await self.users.get(record.user_id)
        if user is None:
            raise NotFoundError("User no longer exists.")
        if user.email_verified_at is None:
            user.email_verified_at = utc_now()
            await self.session.flush()
        await self.reset_tokens.mark_used(record)
        await self.session.commit()
        log.info("auth.verify_email.confirmed", user_id=str(user.id))
        return user

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

    async def _issue_tokens(
        self,
        user: User,
        organization: Organization,
        *,
        client: ClientContext | None,
        parent: UUID | None,
    ) -> AuthResult:
        access = issue_access_token(
            subject=user.id,
            organization_id=organization.id,
        )
        raw_refresh = new_opaque_token(48)
        record: RefreshToken = await self.refresh_tokens.create(
            user_id=user.id,
            organization_id=organization.id,
            token_hash=hash_opaque_token(raw_refresh),
            expires_at=utc_now() + timedelta(seconds=settings.jwt_refresh_ttl_seconds),
            parent_id=parent,
            user_agent=(client.user_agent if client else None),
            ip_address=(client.ip_address if client else None),
        )
        _ = record  # bound for future use (auditing handles below)
        return AuthResult(
            user=user,
            organization=organization,
            access_token=access,
            refresh_token=raw_refresh,
            expires_in=settings.jwt_access_ttl_seconds,
        )
