from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.time import utc_now
from papyrus_api.domain.identity.enums import MembershipRole
from papyrus_api.domain.identity.models import (
    Membership,
    Organization,
    PasswordResetToken,
    User,
)
from papyrus_api.repositories.base import AsyncRepository


class UserRepository(AsyncRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email.lower())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        password_hash: str,
        full_name: str | None,
    ) -> User:
        user = User(
            email=email.lower(),
            password_hash=password_hash,
            full_name=full_name,
            is_active=True,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def update_password(self, user: User, *, password_hash: str) -> User:
        user.password_hash = password_hash
        await self.session.flush()
        return user


class OrganizationRepository(AsyncRepository[Organization]):
    model = Organization

    async def get_by_slug(self, slug: str) -> Organization | None:
        stmt = select(Organization).where(Organization.slug == slug)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, *, name: str, slug: str) -> Organization:
        org = Organization(name=name, slug=slug)
        self.session.add(org)
        await self.session.flush()
        return org

    async def get_primary_for_user(self, user_id: UUID) -> Organization | None:
        stmt = (
            select(Organization)
            .join(Membership, Membership.organization_id == Organization.id)
            .where(Membership.user_id == user_id)
            .order_by(Membership.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class MembershipRepository(AsyncRepository[Membership]):
    model = Membership

    async def create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        role: MembershipRole,
    ) -> Membership:
        membership = Membership(
            user_id=user_id,
            organization_id=organization_id,
            role=role,
        )
        self.session.add(membership)
        await self.session.flush()
        return membership


class PasswordResetTokenRepository(AsyncRepository[PasswordResetToken]):
    model = PasswordResetToken

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def create(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> PasswordResetToken:
        token = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_active_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        stmt = (
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == token_hash)
            .where(PasswordResetToken.used_at.is_(None))
            .where(PasswordResetToken.expires_at > utc_now())
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_used(self, token: PasswordResetToken) -> PasswordResetToken:
        token.used_at = utc_now()
        await self.session.flush()
        return token
