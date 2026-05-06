from __future__ import annotations


def register_models() -> None:
    from papyrus_api.domain import audit, billing, documents, identity, jobs  # noqa: F401
