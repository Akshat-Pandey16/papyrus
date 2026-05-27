from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from papyrus_api.db.base import Base
from papyrus_api.db.mixins import IdMixin, TimestampMixin
from papyrus_api.domain.identity.enums import MembershipRole


class Organization(Base, IdMixin, TimestampMixin):
    __tablename__ = "organizations"
    __table_args__ = (
        Index(
            "ix_organizations_anonymous_created_at",
            "created_at",
            postgresql_where=text("is_anonymous = true"),
        ),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(default=False, nullable=False)


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "ix_users_anonymous_created_at",
            "created_at",
            postgresql_where=text("is_anonymous = true"),
        ),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), default=None, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(default=False, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)


class PasswordResetToken(Base, IdMixin, TimestampMixin):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index(
            "ix_password_reset_tokens_active",
            "token_hash",
            postgresql_where=text("used_at IS NULL"),
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        index=True,
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(20), default="reset", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(index=True, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)


class Membership(Base, IdMixin, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id"),
        Index("ix_memberships_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[MembershipRole] = mapped_column(
        Enum(
            MembershipRole,
            name="membership_role",
            values_callable=lambda e: [m.name for m in e],
        ),
        nullable=False,
    )


class RefreshToken(Base, IdMixin, TimestampMixin):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index(
            "ix_refresh_tokens_active",
            "token_hash",
            postgresql_where=text("revoked_at IS NULL"),
        ),
        Index("ix_refresh_tokens_user_id_revoked_at", "user_id", "revoked_at"),
        Index(
            "ix_refresh_tokens_family_active",
            "family_id",
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[UUID] = mapped_column(nullable=False)
    token_hash: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("refresh_tokens.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), default=None, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), default=None, nullable=True)


class ApiKey(Base, IdMixin, TimestampMixin):
    __tablename__ = "api_keys"
    __table_args__ = (
        Index(
            "ix_api_keys_prefix_active",
            "prefix",
            postgresql_where=text("revoked_at IS NULL"),
        ),
        Index("ix_api_keys_organization_id_revoked_at", "organization_id", "revoked_at"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    hashed_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
