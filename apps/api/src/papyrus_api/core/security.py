from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from papyrus_api.core.config import settings
from papyrus_api.core.errors import AuthenticationError
from papyrus_api.core.time import utc_now

_JWT_ALG = "HS256"


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def new_opaque_token(num_bytes: int = 48) -> str:
    return secrets.token_urlsafe(num_bytes)


def hash_opaque_token(token: str) -> str:
    pepper = settings.jwt_secret.get_secret_value().encode("utf-8")
    return hmac.new(pepper, token.encode("utf-8"), hashlib.sha256).hexdigest()


def secure_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


_password_hasher = PasswordHasher(
    time_cost=settings.argon2_time_cost,
    memory_cost=settings.argon2_memory_cost,
    parallelism=settings.argon2_parallelism,
)


def hash_password(plain: str) -> str:
    return _password_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _password_hasher.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def needs_rehash(hashed: str) -> bool:
    return _password_hasher.check_needs_rehash(hashed)


def issue_access_token(
    *,
    subject: UUID,
    organization_id: UUID | None,
    extra: dict[str, Any] | None = None,
) -> str:
    now = utc_now()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "org": str(organization_id) if organization_id else None,
        "typ": TokenType.ACCESS.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_access_ttl_seconds)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=_JWT_ALG)


def issue_token(
    *,
    subject: UUID,
    organization_id: UUID | None,
    token_type: TokenType,
    extra: dict[str, Any] | None = None,
) -> str:
    if token_type is not TokenType.ACCESS:
        raise ValueError("issue_token only mints access tokens. Use the refresh repo instead.")
    return issue_access_token(
        subject=subject,
        organization_id=organization_id,
        extra=extra,
    )


def decode_token(token: str, *, expected_type: TokenType) -> dict[str, Any]:
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[_JWT_ALG],
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid token.") from exc

    if claims.get("typ") != expected_type.value:
        raise AuthenticationError("Wrong token type.")
    return claims
