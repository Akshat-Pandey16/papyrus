from __future__ import annotations

from uuid import UUID

from ulid import ULID


def new_id() -> UUID:
    return ULID().to_uuid()


def parse_id(raw: str) -> UUID:
    try:
        return ULID.from_str(raw).to_uuid()
    except (ValueError, TypeError):
        return UUID(raw)
