from __future__ import annotations

from uuid import UUID

from uuid_utils import uuid7


def new_id() -> UUID:
    return UUID(bytes=uuid7().bytes)


def parse_id(raw: str) -> UUID:
    return UUID(raw)
