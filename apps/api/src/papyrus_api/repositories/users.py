from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.ids import new_id
from papyrus_api.core.time import utc_now
from papyrus_api.domain.identity.enums import MembershipRole
from papyrus_api.domain.identity.models import (
    Membership,
    Organization,
    PasswordResetToken,
    RefreshToken,
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
        purpose: str = "reset",
    ) -> PasswordResetToken:
        token = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            purpose=purpose,
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_active_by_hash(
        self,
        token_hash: str,
        *,
        purpose: str = "reset",
    ) -> PasswordResetToken | None:
        stmt = (
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == token_hash)
            .where(PasswordResetToken.purpose == purpose)
            .where(PasswordResetToken.used_at.is_(None))
            .where(PasswordResetToken.expires_at > utc_now())
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_used(self, token: PasswordResetToken) -> PasswordResetToken:
        token.used_at = utc_now()
        await self.session.flush()
        return token

    async def revoke_all_for_user(self, user_id: UUID, *, purpose: str = "reset") -> int:
        from sqlalchemy import update

        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id)
            .where(PasswordResetToken.purpose == purpose)
            .where(PasswordResetToken.used_at.is_(None))
            .values(used_at=utc_now())
        )
        result = await self.session.execute(stmt)
        return int(getattr(result, "rowcount", 0) or 0)


class RefreshTokenRepository(AsyncRepository[RefreshToken]):
    model = RefreshToken

    async def create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        token_hash: str,
        expires_at: datetime,
        parent_id: UUID | None = None,
        family_id: UUID | None = None,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> RefreshToken:
        token_id = new_id()
        token = RefreshToken(
            id=token_id,
            family_id=family_id or token_id,
            user_id=user_id,
            organization_id=organization_id,
            token_hash=token_hash,
            parent_id=parent_id,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke(self, token: RefreshToken) -> RefreshToken:
        if token.revoked_at is None:
            token.revoked_at = utc_now()
            await self.session.flush()
        return token

    async def revoke_family(self, family_id: UUID) -> int:
        from sqlalchemy import update

        stmt = (
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utc_now())
        )
        result = await self.session.execute(stmt)
        return int(getattr(result, "rowcount", 0) or 0)

    async def revoke_all_for_user(self, user_id: UUID) -> int:
        from sqlalchemy import update

        stmt = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utc_now())
        )
        result = await self.session.execute(stmt)
        return int(getattr(result, "rowcount", 0) or 0)

    async def list_active_for_user(self, *, user_id: UUID) -> list[RefreshToken]:
        stmt = (
            select(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > utc_now(),
            )
            .order_by(RefreshToken.created_at.desc())
            .limit(50)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def revoke_others_for_user(self, *, user_id: UUID, keep_id: UUID | None) -> int:
        from sqlalchemy import update

        stmt = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utc_now())
        )
        if keep_id is not None:
            stmt = stmt.where(RefreshToken.id != keep_id)
        result = await self.session.execute(stmt)
        return int(getattr(result, "rowcount", 0) or 0)
