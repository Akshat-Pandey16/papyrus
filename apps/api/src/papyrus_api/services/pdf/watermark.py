from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.overlay import OverlayResult, TextOp, apply_overlay

_RGB = tuple[float, float, float]


@dataclass(slots=True, frozen=True)
class WatermarkOptions:
    text: str
    color: _RGB = (0.6, 0.6, 0.6)
    opacity: float = 0.25
    size: float = 48.0
    rotation: float = 45.0
    tile: bool = True
    font: str = "Helvetica-Bold"


def _page_count(input_path: Path) -> int:
    try:
        pdf = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("This PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc
    try:
        return len(pdf.pages)
    finally:
        pdf.close()


def _tile_positions() -> list[tuple[float, float]]:
    coords = (0.2, 0.5, 0.8)
    return [(x, y) for y in coords for x in coords]


def build_watermark_ops(page_count: int, options: WatermarkOptions) -> list[TextOp]:
    positions = _tile_positions() if options.tile else [(0.5, 0.5)]
    ops: list[TextOp] = []
    for page in range(1, page_count + 1):
        for x, y in positions:
            ops.append(
                TextOp(
                    page=page,
                    text=options.text,
                    x=x,
                    y=y,
                    size=options.size,
                    color=options.color,
                    opacity=options.opacity,
                    rotation=options.rotation,
                    font=options.font,
                    align="center",
                )
            )
    return ops


def watermark_pdf(
    *,
    input_path: Path,
    output_path: Path,
    options: WatermarkOptions,
    max_pages: int | None = None,
) -> OverlayResult:
    if not options.text.strip():
        raise ValidationError("Watermark text is required.")
    page_count = _page_count(input_path)
    ops = build_watermark_ops(page_count, options)
    return apply_overlay(
        input_path=input_path,
        output_path=output_path,
        ops=ops,
        max_pages=max_pages,
    )


__all__ = ["WatermarkOptions", "build_watermark_ops", "watermark_pdf"]
