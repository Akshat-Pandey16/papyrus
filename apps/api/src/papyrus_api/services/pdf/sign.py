from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path

from papyrus_api.core.errors import ValidationError
from papyrus_api.services.pdf.overlay import OverlayResult, apply_overlay, ops_from_payload


def sign_pdf(
    *,
    input_path: Path,
    output_path: Path,
    raw_placements: Sequence[object],
    images: Mapping[str, Path] | None = None,
    max_ops: int = 200,
    max_pages: int | None = None,
) -> OverlayResult:
    ops = ops_from_payload(raw_placements, max_ops=max_ops)
    if not ops:
        raise ValidationError("Place at least one signature on the document.")
    return apply_overlay(
        input_path=input_path,
        output_path=output_path,
        ops=ops,
        images=images,
        max_pages=max_pages,
    )


__all__ = ["sign_pdf"]
