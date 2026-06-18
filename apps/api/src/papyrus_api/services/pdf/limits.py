from __future__ import annotations

from papyrus_api.core.errors import TooManyPagesError


def enforce_page_cap(page_count: int, max_pages: int | None) -> None:
    if max_pages is not None and max_pages > 0 and page_count > max_pages:
        raise TooManyPagesError(
            "This document has more pages than this tool allows. "
            "Split it into smaller files first, or sign in for higher limits.",
            details={"page_count": page_count, "max_pages": max_pages},
        )
