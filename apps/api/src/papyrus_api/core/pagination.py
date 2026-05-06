from __future__ import annotations

import base64

from pydantic import BaseModel, ConfigDict, Field


class Page[T](BaseModel):
    model_config = ConfigDict(strict=True)

    items: list[T]
    next_cursor: str | None = None


class PaginationParams(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = None


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> str:
    pad = "=" * (-len(cursor) % 4)
    return base64.urlsafe_b64decode((cursor + pad).encode()).decode()
