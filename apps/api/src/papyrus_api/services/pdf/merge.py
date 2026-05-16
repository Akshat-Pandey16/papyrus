from __future__ import annotations

import contextlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pikepdf
from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.compress import (
    CompressionEngine,
    CompressionLevel,
    CompressOptions,
    compress_pdf,
)
from papyrus_api.services.pdf.page_ranges import parse_flat

_ALLOWED_PDF_VERSIONS = frozenset({"1.4", "1.5", "1.6", "1.7"})
_MAX_BOOKMARK_LABEL_LEN = 200


@dataclass(slots=True, frozen=True)
class MergeInput:
    path: Path
    label: str
    page_ranges: str | None = None


@dataclass(slots=True, frozen=True)
class MergeOptions:
    add_filename_bookmarks: bool = False
    blank_pages_between: int = 0
    strip_metadata: bool = False
    linearize: bool = False
    pdf_version: str | None = None
    compress: CompressOptions | None = None


@dataclass(slots=True, frozen=True)
class MergeResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    input_count: int
    bookmarks_added: int
    blank_pages_added: int
    compressed: bool
    options_applied: dict[str, object] = field(default_factory=dict)


ProgressCallback = Callable[[str], None] | None


def _emit(progress: ProgressCallback, label: str) -> None:
    if progress is None:
        return
    with contextlib.suppress(Exception):
        progress(label)


def _normalize_label(raw: str | None, index: int) -> str:
    base = (raw or f"Document {index + 1}").strip().replace("\\", "_").replace("/", "_")
    if base.lower().endswith(".pdf"):
        base = base[:-4]
    if not base:
        base = f"Document {index + 1}"
    return base[:_MAX_BOOKMARK_LABEL_LEN]


def _save_kwargs_for(options: MergeOptions) -> dict[str, object]:
    kwargs: dict[str, object] = {
        "linearize": bool(options.linearize),
        "compress_streams": True,
        "object_stream_mode": pikepdf.ObjectStreamMode.generate,
    }
    if options.pdf_version is not None:
        if options.pdf_version not in _ALLOWED_PDF_VERSIONS:
            raise ValidationError(
                f"Unsupported pdf_version: {options.pdf_version}",
            )
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


def _add_blank_pages(
    merged: pikepdf.Pdf,
    *,
    count: int,
    reference_page: pikepdf.Page | None,
) -> int:
    if count <= 0:
        return 0
    width, height = 612.0, 792.0
    if reference_page is not None:
        try:
            mb = reference_page.mediabox
            llx = float(mb[0])
            lly = float(mb[1])
            urx = float(mb[2])
            ury = float(mb[3])
            width = abs(urx - llx)
            height = abs(ury - lly)
        except Exception:
            pass
    added = 0
    for _ in range(count):
        try:
            merged.add_blank_page(page_size=(width, height))
            added += 1
        except Exception:
            break
    return added


def _add_filename_bookmark(
    merged: pikepdf.Pdf,
    *,
    label: str,
    target_page_index: int,
) -> bool:
    try:
        with merged.open_outline() as outline:
            item = pikepdf.OutlineItem(
                label,
                page_location=pikepdf.PageLocation.Fit,
                destination=target_page_index,
            )
            outline.root.append(item)
        return True
    except Exception:
        return False


def merge_pdfs(
    *,
    inputs: Sequence[MergeInput],
    output_path: Path,
    options: MergeOptions | None = None,
    progress: ProgressCallback = None,
) -> MergeResult:
    if len(inputs) < 2:
        raise ValidationError("At least two PDFs are required to merge.")
    for index, spec in enumerate(inputs):
        if not spec.path.exists():
            raise FileNotFoundError(str(spec.path))
        if spec.path.stat().st_size == 0:
            raise PdfMalformedError(
                "One of the input PDFs is empty.",
                details={"input_index": index},
            )

    opts = options or MergeOptions()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    _emit(progress, "opening")
    merged = pikepdf.Pdf.new()
    opened: list[pikepdf.Pdf] = []
    input_size_total = 0
    page_count = 0
    bookmarks_added = 0
    blank_pages_added = 0

    try:
        first_page_ref: pikepdf.Page | None = None
        for index, spec in enumerate(inputs):
            _emit(progress, f"appending:{index + 1}")
            input_size_total += spec.path.stat().st_size
            try:
                src = pikepdf.open(str(spec.path))
            except pikepdf.PasswordError as exc:
                raise PdfEncryptedError(
                    "One of the PDFs is password-protected. Remove the password and try again.",
                    details={"input_index": index, "filename": spec.label},
                ) from exc
            except pikepdf.PdfError as exc:
                raise PdfMalformedError(
                    "One of the PDFs is malformed and cannot be processed.",
                    details={"input_index": index, "filename": spec.label},
                ) from exc
            opened.append(src)

            src_page_count = len(src.pages)
            page_indices = parse_flat(spec.page_ranges, page_count=src_page_count)

            if index > 0 and opts.blank_pages_between > 0:
                just_added = _add_blank_pages(
                    merged,
                    count=opts.blank_pages_between,
                    reference_page=first_page_ref,
                )
                blank_pages_added += just_added
                page_count += just_added

            start_page_index = page_count
            for page_idx in page_indices:
                merged.pages.append(src.pages[page_idx])
                page_count += 1
                if first_page_ref is None:
                    try:
                        first_page_ref = merged.pages[-1]
                    except Exception:
                        first_page_ref = None

            if (
                opts.add_filename_bookmarks
                and start_page_index < page_count
                and _add_filename_bookmark(
                    merged,
                    label=_normalize_label(spec.label, index),
                    target_page_index=start_page_index,
                )
            ):
                bookmarks_added += 1

        if opts.strip_metadata:
            _emit(progress, "stripping_metadata")
            _strip_metadata(merged)

        _emit(progress, "saving")
        save_kwargs = _save_kwargs_for(opts)
        try:
            merged.save(str(output_path), **save_kwargs)
        except pikepdf.PdfError as exc:
            raise PdfMalformedError(
                "The merged PDF could not be written.",
            ) from exc
    finally:
        for src in opened:
            with contextlib.suppress(Exception):
                src.close()
        with contextlib.suppress(Exception):
            merged.close()

    compressed = False
    if opts.compress is not None:
        _emit(progress, "compressing")
        post_path = output_path.with_suffix(output_path.suffix + ".compressed")
        try:
            try:
                compress_pdf(
                    input_path=output_path,
                    output_path=post_path,
                    level=CompressionLevel.CUSTOM,
                    options=opts.compress,
                )
            except (PdfEncryptedError, PdfMalformedError):
                raise
            except Exception:
                pass
            else:
                try:
                    output_path.write_bytes(post_path.read_bytes())
                    compressed = True
                except OSError:
                    pass
        finally:
            with contextlib.suppress(OSError):
                post_path.unlink(missing_ok=True)

    _verify_output(output_path)
    output_size = output_path.stat().st_size
    _emit(progress, "saved")

    options_applied = {
        "add_filename_bookmarks": opts.add_filename_bookmarks,
        "blank_pages_between": opts.blank_pages_between,
        "strip_metadata": opts.strip_metadata,
        "linearize": opts.linearize,
        "pdf_version": opts.pdf_version,
        "compress_engine": (opts.compress.engine.value if opts.compress is not None else None),
    }

    return MergeResult(
        output_path=output_path,
        output_size_bytes=output_size,
        input_size_bytes=input_size_total,
        page_count=page_count,
        input_count=len(inputs),
        bookmarks_added=bookmarks_added,
        blank_pages_added=blank_pages_added,
        compressed=compressed,
        options_applied=options_applied,
    )


def _verify_output(path: Path) -> None:
    try:
        verifier = pikepdf.open(str(path))
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("Merged output failed verification.") from exc
    try:
        _ = len(verifier.pages)
    finally:
        verifier.close()


__all__ = [
    "CompressionEngine",
    "MergeInput",
    "MergeOptions",
    "MergeResult",
    "merge_pdfs",
]
