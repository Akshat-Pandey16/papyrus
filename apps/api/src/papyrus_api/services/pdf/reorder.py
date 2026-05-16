from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf
from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)


@dataclass(slots=True, frozen=True)
class ReorderResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def reorder_pdf(
    *,
    input_path: Path,
    output_path: Path,
    order: list[int],
) -> ReorderResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    if not order:
        raise ValidationError("Order list must contain at least one page.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("PDF appears to be malformed.") from exc

    try:
        page_count = len(src.pages)
        for raw in order:
            if raw < 1 or raw > page_count:
                raise ValidationError(
                    f"Page {raw} is out of bounds for {page_count}-page document.",
                )
        out = pikepdf.Pdf.new()
        try:
            for raw in order:
                out.pages.append(src.pages[raw - 1])
            out.save(
                str(output_path),
                linearize=False,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )
        finally:
            out.close()
    finally:
        src.close()

    output_size = output_path.stat().st_size
    return ReorderResult(
        output_path=output_path,
        output_size_bytes=output_size,
        input_size_bytes=input_size,
        page_count=len(order),
    )
