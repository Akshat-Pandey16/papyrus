from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.limits import enforce_page_cap

_VALID_ROTATIONS = {0, 90, 180, 270, -90, -180, -270}


@dataclass(slots=True, frozen=True)
class RotateResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def rotate_pdf(
    *,
    input_path: Path,
    output_path: Path,
    rotations: dict[int, int],
    max_pages: int | None = None,
) -> RotateResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    for page, deg in rotations.items():
        if deg not in _VALID_ROTATIONS:
            raise ValidationError(f"Invalid rotation {deg} for page {page}.")

    try:
        pdf = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("PDF appears to be malformed.") from exc

    try:
        page_count = len(pdf.pages)
        enforce_page_cap(page_count, max_pages)
        for raw_page, deg in rotations.items():
            page_idx = raw_page - 1
            if page_idx < 0 or page_idx >= page_count:
                raise ValidationError(
                    f"Page {raw_page} is out of bounds for {page_count}-page document.",
                )
            if deg % 360 == 0:
                continue
            pdf.pages[page_idx].rotate(deg, relative=True)
        pdf.save(
            str(output_path),
            linearize=False,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )
    finally:
        pdf.close()

    output_size = output_path.stat().st_size
    return RotateResult(
        output_path=output_path,
        output_size_bytes=output_size,
        input_size_bytes=input_size,
        page_count=page_count,
    )
