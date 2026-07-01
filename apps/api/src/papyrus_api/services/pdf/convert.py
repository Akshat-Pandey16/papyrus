from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from papyrus_api.core.errors import PdfMalformedError, ToolNotConfiguredError, ValidationError
from papyrus_api.services.pdf._subprocess import run_capture

_SOFFICE = shutil.which("soffice") or shutil.which("libreoffice")
_CONVERT_TIMEOUT_SECONDS = 180

OFFICE_EXTENSIONS = frozenset(
    {"doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp"}
)

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def soffice_available() -> bool:
    return _SOFFICE is not None


@dataclass(slots=True, frozen=True)
class ConvertResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int


def office_to_pdf(*, input_path: Path, output_path: Path, profile_dir: Path) -> ConvertResult:
    if _SOFFICE is None:
        raise ToolNotConfiguredError(
            "Document conversion is not available on this server.",
        )
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        _SOFFICE,
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        f"-env:UserInstallation=file://{profile_dir}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    result = run_capture(cmd, timeout=_CONVERT_TIMEOUT_SECONDS)
    produced = out_dir / f"{input_path.stem}.pdf"
    if result.returncode != 0 or not produced.exists() or produced.stat().st_size == 0:
        raise ValidationError(
            "Could not convert this document to PDF. It may be corrupt or unsupported.",
        )
    if produced != output_path:
        produced.replace(output_path)
    return ConvertResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
    )


def pdf_to_word(*, input_path: Path, output_path: Path, profile_dir: Path) -> ConvertResult:
    if _SOFFICE is None:
        raise ToolNotConfiguredError(
            "Document conversion is not available on this server.",
        )
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        _SOFFICE,
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        f"-env:UserInstallation=file://{profile_dir}",
        "--infilter=writer_pdf_import",
        "--convert-to",
        "docx",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    result = run_capture(cmd, timeout=_CONVERT_TIMEOUT_SECONDS)
    produced = out_dir / f"{input_path.stem}.docx"
    if result.returncode != 0 or not produced.exists() or produced.stat().st_size == 0:
        raise ValidationError(
            "Could not convert this PDF to Word. Scanned or image-only PDFs "
            "can't be converted to editable text — try OCR first.",
        )
    if produced != output_path:
        produced.replace(output_path)
    return ConvertResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
    )


def pdf_to_pptx(*, input_path: Path, output_path: Path, profile_dir: Path) -> ConvertResult:
    if _SOFFICE is None:
        raise ToolNotConfiguredError(
            "Document conversion is not available on this server.",
        )
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        _SOFFICE,
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        f"-env:UserInstallation=file://{profile_dir}",
        "--infilter=impress_pdf_import",
        "--convert-to",
        "pptx",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    result = run_capture(cmd, timeout=_CONVERT_TIMEOUT_SECONDS)
    produced = out_dir / f"{input_path.stem}.pptx"
    if result.returncode != 0 or not produced.exists() or produced.stat().st_size == 0:
        raise ValidationError(
            "Could not convert this PDF to PowerPoint. Scanned or complex PDFs "
            "may come through as images rather than editable slides.",
        )
    if produced != output_path:
        produced.replace(output_path)
    return ConvertResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
    )


__all__ = [
    "DOCX_CONTENT_TYPE",
    "OFFICE_EXTENSIONS",
    "PPTX_CONTENT_TYPE",
    "ConvertResult",
    "office_to_pdf",
    "pdf_to_pptx",
    "pdf_to_word",
    "soffice_available",
]
