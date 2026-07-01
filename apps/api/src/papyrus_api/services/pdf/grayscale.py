from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError
from papyrus_api.services.pdf._subprocess import run_capture
from papyrus_api.services.pdf.gs_runtime import ensure_gs_runtime
from papyrus_api.services.pdf.limits import enforce_page_cap

_GRAYSCALE_TIMEOUT_SECONDS = 300


@dataclass(slots=True, frozen=True)
class GrayscaleResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def grayscale_pdf(
    *,
    input_path: Path,
    output_path: Path,
    max_pages: int | None = None,
) -> GrayscaleResult:
    caps = ensure_gs_runtime()
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    if max_pages is not None:
        try:
            with pikepdf.open(str(input_path)) as probe:
                enforce_page_cap(len(probe.pages), max_pages)
        except pikepdf.PasswordError as exc:
            raise PdfEncryptedError("PDF is password-protected.") from exc
        except pikepdf.PdfError as exc:
            raise PdfMalformedError("This PDF appears to be malformed.") from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        caps.binary,
        "-sDEVICE=pdfwrite",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-dCompatibilityLevel=1.7",
        "-sColorConversionStrategy=Gray",
        "-sProcessColorModel=DeviceGray",
        "-dOverrideICC=true",
        f"-sOutputFile={output_path}",
        str(input_path),
    ]
    result = run_capture(cmd, timeout=_GRAYSCALE_TIMEOUT_SECONDS)
    if result.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        raise ValidationError("Could not convert this PDF to grayscale.")

    with pikepdf.open(str(output_path)) as pdf:
        page_count = len(pdf.pages)

    return GrayscaleResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
    )


__all__ = ["GrayscaleResult", "grayscale_pdf"]
