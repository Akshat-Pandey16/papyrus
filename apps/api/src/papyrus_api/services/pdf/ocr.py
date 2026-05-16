from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from papyrus_api.core.errors import AppError, PdfMalformedError


class OcrNotConfiguredError(AppError):
    code = "ocr_not_configured"
    http_status = 503


@dataclass(slots=True, frozen=True)
class OcrResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int


def _binary_present(name: str) -> bool:
    return shutil.which(name) is not None


def ensure_ocr_runtime() -> None:
    missing = [b for b in ("ocrmypdf", "tesseract", "gs") if not _binary_present(b)]
    if missing:
        raise OcrNotConfiguredError(
            "OCR is not configured on this server.",
            details={
                "missing": missing,
                "hint": "Install ocrmypdf + tesseract + ghostscript on the worker host.",
            },
        )


def ocr_pdf(
    *,
    input_path: Path,
    output_path: Path,
    language: str = "eng",
    deskew: bool = True,
    optimize: int = 1,
) -> OcrResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    ensure_ocr_runtime()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ocrmypdf",
        "--language",
        language,
        "--optimize",
        str(optimize),
        "--skip-text",
        "--quiet",
    ]
    if deskew:
        cmd.append("--deskew")
    cmd.extend([str(input_path), str(output_path)])

    completed = subprocess.run(  # noqa: S603
        cmd,
        capture_output=True,
        text=True,
        check=False,
        timeout=600,
    )
    if completed.returncode != 0:
        message = (completed.stderr or "OCR failed.").strip()[:500]
        if "Encrypted" in message or "password" in message.lower():
            raise PdfMalformedError("PDF is password-protected. Remove the password and retry.")
        raise AppError(
            f"OCR failed: {message}",
            details={"return_code": completed.returncode},
        )

    return OcrResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
    )
