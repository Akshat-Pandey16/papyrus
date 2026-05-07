from __future__ import annotations

import contextlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError


@dataclass(slots=True, frozen=True)
class MergeResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    input_count: int


ProgressCallback = Callable[[str], None] | None


class MergeStrategy(Protocol):
    def merge(
        self,
        *,
        input_paths: Sequence[Path],
        output_path: Path,
        progress: ProgressCallback,
    ) -> MergeResult: ...


def _emit(progress: ProgressCallback, label: str) -> None:
    if progress is not None:
        with contextlib.suppress(Exception):
            progress(label)


class PikepdfMergeStrategy:
    def merge(
        self,
        *,
        input_paths: Sequence[Path],
        output_path: Path,
        progress: ProgressCallback,
    ) -> MergeResult:
        _emit(progress, "opening")
        merged = pikepdf.Pdf.new()
        opened: list[pikepdf.Pdf] = []
        try:
            input_size_total = 0
            page_count = 0
            for index, src_path in enumerate(input_paths):
                _emit(progress, f"appending:{index + 1}")
                input_size_total += src_path.stat().st_size
                try:
                    src = pikepdf.open(str(src_path))
                except pikepdf.PasswordError as exc:
                    raise PdfEncryptedError(
                        "One of the PDFs is password-protected. Remove the password and try again.",
                        details={"input_index": index},
                    ) from exc
                except pikepdf.PdfError as exc:
                    raise PdfMalformedError(
                        "One of the PDFs is malformed and cannot be processed.",
                        details={"input_index": index},
                    ) from exc
                opened.append(src)
                merged.pages.extend(src.pages)
                page_count += len(src.pages)

            _emit(progress, "saving")
            try:
                merged.save(
                    str(output_path),
                    linearize=False,
                    compress_streams=True,
                    object_stream_mode=pikepdf.ObjectStreamMode.generate,
                )
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

        output_size = output_path.stat().st_size
        _emit(progress, "saved")
        return MergeResult(
            output_path=output_path,
            output_size_bytes=output_size,
            input_size_bytes=input_size_total,
            page_count=page_count,
            input_count=len(input_paths),
        )


_strategy: MergeStrategy = PikepdfMergeStrategy()


def merge_pdfs(
    *,
    input_paths: Sequence[Path],
    output_path: Path,
    progress: ProgressCallback = None,
) -> MergeResult:
    if len(input_paths) < 2:
        raise ValidationError("At least two PDFs are required to merge.")
    for index, path in enumerate(input_paths):
        if not path.exists():
            raise FileNotFoundError(str(path))
        if path.stat().st_size == 0:
            raise PdfMalformedError(
                "One of the input PDFs is empty.",
                details={"input_index": index},
            )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return _strategy.merge(
        input_paths=input_paths,
        output_path=output_path,
        progress=progress,
    )
