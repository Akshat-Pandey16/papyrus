from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from papyrus_api.core.errors import AppError, PdfEncryptedError, PdfMalformedError
from papyrus_api.services.pdf._subprocess import run_capture

_OCR_EXIT_INPUT_ERROR = 2
_OCR_EXIT_ENCRYPTED = 8
_OCR_TIMEOUT_SECONDS = 600
_LANG_RE = re.compile(r"^[a-z]{2,}(?:_[a-z]+)*(?:\+[a-z]{2,}(?:_[a-z]+)*)*$")


class OcrNotConfiguredError(AppError):
    code = "ocr_not_configured"
    http_status = 503


def _validate_language(language: str) -> str:
    lang = language.strip().lower()
    if len(lang) > 32 or not _LANG_RE.match(lang):
        raise AppError(
            "Unsupported OCR language.",
            details={"language": language[:32]},
        )
    return lang


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
    lang = _validate_language(language)
    ensure_ocr_runtime()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ocrmypdf",
        "--language",
        lang,
        "--optimize",
        str(optimize),
        "--skip-text",
        "--quiet",
    ]
    if deskew:
        cmd.append("--deskew")
    cmd.extend([str(input_path), str(output_path)])

    try:
        completed = run_capture(cmd, timeout=_OCR_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise AppError("OCR timed out on this document.") from exc

    if completed.returncode != 0:
        message = (completed.stderr or "OCR failed.").strip()[:500]
        lowered = message.lower()
        if (
            completed.returncode == _OCR_EXIT_ENCRYPTED
            or "encrypted" in lowered
            or "password" in lowered
        ):
            raise PdfEncryptedError(
                "This PDF is password-protected. Remove the password and retry.",
            )
        if completed.returncode == _OCR_EXIT_INPUT_ERROR:
            raise PdfMalformedError("This PDF could not be read for OCR.")
        raise AppError(
            f"OCR failed: {message}",
            details={"return_code": completed.returncode},
        )

    return OcrResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
    )
