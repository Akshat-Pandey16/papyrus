from __future__ import annotations

import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError


@dataclass(slots=True, frozen=True)
class SplitResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    parts: int
    page_count: int


def _parse_ranges(spec: str, page_count: int) -> list[list[int]]:
    parts: list[list[int]] = []
    raw_parts = [p.strip() for p in spec.split(",") if p.strip()]
    if not raw_parts:
        raise ValidationError("Split spec must contain at least one range.")
    for raw in raw_parts:
        if "-" in raw:
            lo_raw, hi_raw = raw.split("-", 1)
            try:
                lo = int(lo_raw)
                hi = int(hi_raw)
            except ValueError as exc:
                raise ValidationError(f"Invalid range '{raw}'.") from exc
            if lo < 1 or hi < lo or hi > page_count:
                raise ValidationError(
                    f"Range '{raw}' is out of bounds for {page_count}-page document.",
                )
            parts.append(list(range(lo - 1, hi)))
        else:
            try:
                page = int(raw)
            except ValueError as exc:
                raise ValidationError(f"Invalid page '{raw}'.") from exc
            if page < 1 or page > page_count:
                raise ValidationError(
                    f"Page '{raw}' is out of bounds for {page_count}-page document.",
                )
            parts.append([page - 1])
    return parts


def split_pdf(
    *,
    input_path: Path,
    output_path: Path,
    ranges: str,
    base_name: str = "part",
) -> SplitResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError(
            "This PDF is password-protected. Remove the password and try again.",
        ) from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    try:
        page_count = len(src.pages)
        groups = _parse_ranges(ranges, page_count)

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for idx, group in enumerate(groups, start=1):
                buffer_path = output_path.with_name(f".{output_path.stem}-part-{idx}.pdf")
                try:
                    out = pikepdf.Pdf.new()
                    try:
                        for page_idx in group:
                            out.pages.append(src.pages[page_idx])
                        out.save(
                            str(buffer_path),
                            linearize=False,
                            compress_streams=True,
                            object_stream_mode=pikepdf.ObjectStreamMode.generate,
                        )
                    finally:
                        out.close()
                    zf.write(
                        buffer_path,
                        arcname=f"{base_name}-{idx:03d}.pdf",
                    )
                finally:
                    if buffer_path.exists():
                        buffer_path.unlink(missing_ok=True)
    finally:
        src.close()

    output_size = output_path.stat().st_size
    return SplitResult(
        output_path=output_path,
        output_size_bytes=output_size,
        input_size_bytes=input_size,
        parts=len(groups),
        page_count=page_count,
    )


def split_into_zip(
    *,
    input_path: Path,
    output_path: Path,
    ranges: Sequence[str],
) -> SplitResult:
    return split_pdf(
        input_path=input_path,
        output_path=output_path,
        ranges=",".join(ranges),
    )
