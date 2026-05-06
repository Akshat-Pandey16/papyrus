from __future__ import annotations

from typing import Literal

from fastapi import Response

from papyrus_api.core.config import settings

_SameSite = Literal["lax", "strict", "none"]


def _samesite() -> _SameSite:
    value = settings.refresh_cookie_samesite.lower()
    if value not in {"lax", "strict", "none"}:
        return "lax"
    return value  # type: ignore[return-value]


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=settings.jwt_refresh_ttl_seconds,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain,
        secure=settings.is_production,
        httponly=True,
        samesite=_samesite(),
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain,
    )
