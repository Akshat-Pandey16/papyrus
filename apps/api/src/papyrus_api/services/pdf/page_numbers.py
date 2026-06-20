from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError
from papyrus_api.services.pdf.overlay import OverlayResult, TextOp, apply_overlay

_RGB = tuple[float, float, float]

_POSITIONS = {
    "bottom-center": (0.5, 0.95, "center"),
    "bottom-right": (0.92, 0.95, "right"),
    "bottom-left": (0.08, 0.95, "left"),
    "top-center": (0.5, 0.05, "center"),
    "top-right": (0.92, 0.05, "right"),
    "top-left": (0.08, 0.05, "left"),
}


@dataclass(slots=True, frozen=True)
class PageNumberOptions:
    fmt: str = "{n}"
    position: str = "bottom-center"
    start_at: int = 1
    size: float = 11.0
    color: _RGB = (0.1, 0.1, 0.1)
    font: str = "Helvetica"


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


def _render_label(fmt: str, number: int, total: int) -> str:
    try:
        return fmt.format(n=number, total=total)
    except (KeyError, IndexError, ValueError):
        return str(number)


def build_page_number_ops(page_count: int, options: PageNumberOptions) -> list[TextOp]:
    x, y, align = _POSITIONS.get(options.position, _POSITIONS["bottom-center"])
    total = page_count + max(0, options.start_at - 1)
    ops: list[TextOp] = []
    for index in range(page_count):
        number = options.start_at + index
        ops.append(
            TextOp(
                page=index + 1,
                text=_render_label(options.fmt, number, total),
                x=x,
                y=y,
                size=options.size,
                color=options.color,
                opacity=1.0,
                font=options.font,
                align=align,
            )
        )
    return ops


def number_pages_pdf(
    *,
    input_path: Path,
    output_path: Path,
    options: PageNumberOptions,
    max_pages: int | None = None,
) -> OverlayResult:
    page_count = _page_count(input_path)
    ops = build_page_number_ops(page_count, options)
    return apply_overlay(
        input_path=input_path,
        output_path=output_path,
        ops=ops,
        max_pages=max_pages,
    )


__all__ = ["PageNumberOptions", "build_page_number_ops", "number_pages_pdf"]
