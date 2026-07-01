from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfMalformedError, ToolNotConfiguredError, ValidationError
from papyrus_api.services.pdf._subprocess import run_capture

_QPDF = shutil.which("qpdf")
_FLATTEN_TIMEOUT_SECONDS = 120


@dataclass(slots=True, frozen=True)
class FlattenResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def flatten_pdf(*, input_path: Path, output_path: Path) -> FlattenResult:
    if _QPDF is None:
        raise ToolNotConfiguredError("PDF flattening is not available on this server.")
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    run_capture(
        [
            _QPDF,
            "--warning-exit-0",
            "--flatten-annotations=all",
            "--generate-appearances",
            "--",
            str(input_path),
            str(output_path),
        ],
        timeout=_FLATTEN_TIMEOUT_SECONDS,
    )
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise ValidationError("Could not flatten this PDF.")
    try:
        with pikepdf.open(str(output_path)) as pdf:
            page_count = len(pdf.pages)
    except pikepdf.PdfError as exc:
        raise ValidationError("Could not flatten this PDF.") from exc

    return FlattenResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
    )


__all__ = ["FlattenResult", "flatten_pdf"]
