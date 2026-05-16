from __future__ import annotations

import contextlib
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError
from papyrus_api.services.pdf.compress import (
    CompressionLevel,
    CompressOptions,
    compress_pdf,
)
from papyrus_api.services.pdf.page_ranges import parse_groups

_ALLOWED_PDF_VERSIONS = frozenset({"1.4", "1.5", "1.6", "1.7"})


class SplitMode(StrEnum):
    RANGES = "ranges"
    EVERY_N = "every_n"
    SINGLE_PAGES = "single_pages"


@dataclass(slots=True, frozen=True)
class SplitOptions:
    combine_into_single: bool = False
    strip_metadata: bool = False
    linearize: bool = False
    pdf_version: str | None = None
    compress: CompressOptions | None = None


@dataclass(slots=True, frozen=True)
class SplitResult:
    output_path: Path
    output_extension: str
    output_size_bytes: int
    input_size_bytes: int
    parts: int
    page_count: int
    selected_page_count: int
    combined: bool
    compressed: bool
    options_applied: dict[str, object] = field(default_factory=dict)


def _structured_ranges_to_groups(
    ranges: Sequence[dict[str, int]],
    *,
    page_count: int,
) -> list[list[int]]:
    if not ranges:
        raise ValidationError("At least one range is required.")
    if len(ranges) > 100:
        raise ValidationError("Too many ranges; limit is 100.")
    groups: list[list[int]] = []
    for index, entry in enumerate(ranges):
        try:
            lo = int(entry["from"])
            hi = int(entry["to"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError(
                "Range is missing 'from'/'to'.",
                details={"index": index},
            ) from exc
        if lo < 1 or hi < lo or hi > page_count:
            raise ValidationError(
                f"Range {lo}-{hi} is out of bounds for {page_count}-page document.",
                details={"index": index},
            )
        groups.append(list(range(lo - 1, hi)))
    return groups


def _every_n_groups(every_n: int, *, page_count: int) -> list[list[int]]:
    if every_n < 1:
        raise ValidationError("every_n must be >= 1.")
    return [
        list(range(start, min(page_count, start + every_n)))
        for start in range(0, page_count, every_n)
    ]


def _single_page_groups(page_count: int) -> list[list[int]]:
    return [[i] for i in range(page_count)]


def _save_kwargs_for(options: SplitOptions) -> dict[str, object]:
    kwargs: dict[str, object] = {
        "linearize": bool(options.linearize),
        "compress_streams": True,
        "object_stream_mode": pikepdf.ObjectStreamMode.generate,
    }
    if options.pdf_version is not None:
        if options.pdf_version not in _ALLOWED_PDF_VERSIONS:
            raise ValidationError(f"Unsupported pdf_version: {options.pdf_version}")
        kwargs["min_version"] = options.pdf_version
    return kwargs


def _strip_metadata(pdf: pikepdf.Pdf) -> None:
    try:
        docinfo = pdf.docinfo
        if docinfo is not None and len(docinfo) > 0:
            for key in list(docinfo.keys()):
                with contextlib.suppress(Exception):
                    del docinfo[key]
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta:
            for key in list(meta.keys()):
                with contextlib.suppress(Exception):
                    del meta[key]
    except Exception:
        pass


def _write_subset(
    src: pikepdf.Pdf,
    *,
    pages: Sequence[int],
    out_path: Path,
    options: SplitOptions,
) -> None:
    out = pikepdf.Pdf.new()
    try:
        for page_idx in pages:
            out.pages.append(src.pages[page_idx])
        if options.strip_metadata:
            _strip_metadata(out)
        try:
            out.save(str(out_path), **_save_kwargs_for(options))
        except pikepdf.PdfError as exc:
            raise PdfMalformedError(
                "Split output could not be written.",
            ) from exc
    finally:
        out.close()


def _maybe_compress(path: Path, *, options: SplitOptions) -> bool:
    if options.compress is None:
        return False
    tmp = path.with_suffix(path.suffix + ".compressed")
    try:
        try:
            compress_pdf(
                input_path=path,
                output_path=tmp,
                level=CompressionLevel.CUSTOM,
                options=options.compress,
            )
        except (PdfEncryptedError, PdfMalformedError):
            raise
        except Exception:
            return False
        try:
            path.write_bytes(tmp.read_bytes())
            return True
        except OSError:
            return False
    finally:
        with contextlib.suppress(OSError):
            tmp.unlink(missing_ok=True)


def split_pdf(
    *,
    input_path: Path,
    output_path: Path,
    mode: SplitMode = SplitMode.RANGES,
    ranges: Sequence[dict[str, int]] | None = None,
    every_n: int | None = None,
    options: SplitOptions | None = None,
    base_name: str = "part",
    legacy_ranges_spec: str | None = None,
) -> SplitResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    opts = options or SplitOptions()
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
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")

        if mode is SplitMode.RANGES:
            if ranges is not None:
                groups = _structured_ranges_to_groups(ranges, page_count=page_count)
            elif legacy_ranges_spec is not None:
                groups = parse_groups(legacy_ranges_spec, page_count=page_count)
            else:
                raise ValidationError("Ranges mode requires ranges.")
        elif mode is SplitMode.EVERY_N:
            if every_n is None:
                raise ValidationError("Every-N mode requires every_n.")
            groups = _every_n_groups(every_n, page_count=page_count)
        else:
            groups = _single_page_groups(page_count)

        selected_page_count = sum(len(g) for g in groups)
        combine = opts.combine_into_single and mode is SplitMode.RANGES
        compressed = False

        if combine:
            combined_pages: list[int] = []
            for group in groups:
                combined_pages.extend(group)
            _write_subset(src, pages=combined_pages, out_path=output_path, options=opts)
            compressed = _maybe_compress(output_path, options=opts)
            output_ext = "pdf"
            parts = 1
        else:
            output_ext = "zip"
            with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for idx, group in enumerate(groups, start=1):
                    buffer_path = output_path.with_name(
                        f".{output_path.stem}-part-{idx:04d}.pdf"
                    )
                    try:
                        _write_subset(
                            src, pages=group, out_path=buffer_path, options=opts
                        )
                        compressed = _maybe_compress(buffer_path, options=opts) or compressed
                        zf.write(
                            buffer_path,
                            arcname=f"{base_name}-{idx:04d}.pdf",
                        )
                    finally:
                        with contextlib.suppress(OSError):
                            buffer_path.unlink(missing_ok=True)
            parts = len(groups)
    finally:
        src.close()

    output_size = output_path.stat().st_size

    options_applied = {
        "mode": mode.value,
        "combine_into_single": combine if mode is SplitMode.RANGES else False,
        "strip_metadata": opts.strip_metadata,
        "linearize": opts.linearize,
        "pdf_version": opts.pdf_version,
        "compress_engine": opts.compress.engine.value if opts.compress is not None else None,
    }

    return SplitResult(
        output_path=output_path,
        output_extension=output_ext,
        output_size_bytes=output_size,
        input_size_bytes=input_size,
        parts=parts,
        page_count=page_count,
        selected_page_count=selected_page_count,
        combined=combine,
        compressed=compressed,
        options_applied=options_applied,
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
        mode=SplitMode.RANGES,
        legacy_ranges_spec=",".join(ranges),
    )


__all__ = [
    "SplitMode",
    "SplitOptions",
    "SplitResult",
    "split_pdf",
]
