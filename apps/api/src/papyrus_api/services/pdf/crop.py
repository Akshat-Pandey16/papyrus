from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.limits import enforce_page_cap


@dataclass(slots=True, frozen=True)
class CropBox:
    x: float
    y: float
    w: float
    h: float


@dataclass(slots=True, frozen=True)
class CropResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    pages_cropped: int


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalize_box(raw: object) -> CropBox:
    if not isinstance(raw, dict):
        raise ValidationError("A crop rectangle is required.")
    try:
        x = _clamp01(float(raw["x"]))
        y = _clamp01(float(raw["y"]))
        w = _clamp01(float(raw["w"]))
        h = _clamp01(float(raw["h"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValidationError("Crop rectangle must have x, y, w, h fractions.") from exc
    if w <= 0.0 or h <= 0.0:
        raise ValidationError("Crop rectangle must have positive width and height.")
    if x + w > 1.0001 or y + h > 1.0001:
        raise ValidationError("Crop rectangle must stay within the page.")
    return CropBox(x=x, y=y, w=w, h=h)


def crop_pdf(
    *,
    input_path: Path,
    output_path: Path,
    box: CropBox,
    pages: Sequence[int] | None = None,
    max_pages: int | None = None,
) -> CropResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    try:
        pdf = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("This PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    cropped = 0
    try:
        page_count = len(pdf.pages)
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")
        enforce_page_cap(page_count, max_pages)
        target = set(pages) if pages else set(range(1, page_count + 1))

        for index, page in enumerate(pdf.pages, start=1):
            if index not in target:
                continue
            mb = page.mediabox
            x0 = float(mb[0])
            y0 = float(mb[1])
            x1 = float(mb[2])
            y1 = float(mb[3])
            width = x1 - x0
            height = y1 - y0
            if width <= 0 or height <= 0:
                continue
            new_x0 = x0 + box.x * width
            new_x1 = x0 + (box.x + box.w) * width
            new_y1 = y1 - box.y * height
            new_y0 = y1 - (box.y + box.h) * height
            rect = pikepdf.Rectangle(
                round(new_x0, 3),
                round(new_y0, 3),
                round(new_x1, 3),
                round(new_y1, 3),
            )
            page.cropbox = rect
            page.mediabox = rect
            page.trimbox = rect
            cropped += 1

        pdf.save(
            str(output_path),
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )
    finally:
        pdf.close()

    return CropResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        pages_cropped=cropped,
    )


__all__ = ["CropBox", "CropResult", "crop_pdf", "normalize_box"]
