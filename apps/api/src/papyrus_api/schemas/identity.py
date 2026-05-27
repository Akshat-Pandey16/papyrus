from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, EmailStr, Field, field_validator, model_validator

from papyrus_api.schemas.common import StrictModel

PasswordStr = Field(min_length=8, max_length=128)


class _MutableModel(StrictModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class SignupRequest(_MutableModel):
    email: EmailStr
    password: str = PasswordStr
    confirm_password: str = PasswordStr
    full_name: str | None = Field(default=None, max_length=200)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if value.strip() != value:
            raise ValueError("Password must not start or end with whitespace.")
        has_letter = any(c.isalpha() for c in value)
        has_digit = any(c.isdigit() for c in value)
        if not (has_letter and has_digit):
            raise ValueError("Password must include at least one letter and one digit.")
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> Self:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(_MutableModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(_MutableModel):
    email: EmailStr


class ResetPasswordRequest(_MutableModel):
    token: str = Field(min_length=10, max_length=512)
    password: str = PasswordStr
    confirm_password: str = PasswordStr

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        has_letter = any(c.isalpha() for c in value)
        has_digit = any(c.isdigit() for c in value)
        if not (has_letter and has_digit):
            raise ValueError("Password must include at least one letter and one digit.")
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> Self:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class OrganizationOut(StrictModel):
    id: UUID
    name: str
    slug: str


class UserOut(StrictModel):
    id: UUID
    email: str
    full_name: str | None
    is_active: bool
    is_anonymous: bool
    email_verified_at: datetime | None
    created_at: datetime


class AccessToken(StrictModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


class AuthSession(StrictModel):
    user: UserOut
    organization: OrganizationOut
    access: AccessToken


class ForgotPasswordResponse(StrictModel):
    detail: str
    debug_token: str | None = None


class GenericMessage(StrictModel):
    detail: str


class ChangePasswordRequest(_MutableModel):
    current_password: str = Field(min_length=1, max_length=128)
    password: str = PasswordStr
    confirm_password: str = PasswordStr

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        has_letter = any(c.isalpha() for c in value)
        has_digit = any(c.isdigit() for c in value)
        if not (has_letter and has_digit):
            raise ValueError("Password must include at least one letter and one digit.")
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> Self:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        if self.password == self.current_password:
            raise ValueError("New password must differ from the current password.")
        return self


class UpdateProfileRequest(_MutableModel):
    full_name: str | None = Field(default=None, max_length=200)


class SessionOut(StrictModel):
    id: UUID
    created_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip_address: str | None
    current: bool


class SessionsList(StrictModel):
    items: list[SessionOut]


class VerifyEmailRequest(_MutableModel):
    token: str = Field(min_length=10, max_length=512)


class VerifyEmailResponse(StrictModel):
    detail: str
    debug_token: str | None = None
