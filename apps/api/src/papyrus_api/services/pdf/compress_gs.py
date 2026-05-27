from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError
from papyrus_api.services.pdf._subprocess import run_capture
from papyrus_api.services.pdf.gs_runtime import (
    GsCapabilities,
    GsNotConfiguredError,
    ensure_gs_runtime,
)

_DEFAULT_PAGE_INCHES = 11.0
_DEFAULT_TIMEOUT_SECONDS = 600
_PDF_VERSIONS = {"1.4", "1.5", "1.6", "1.7"}


@dataclass(slots=True, frozen=True)
class GsCompressInputs:
    input_path: Path
    output_path: Path
    image_quality: int
    image_max_dimension: int | None
    color_mode: str
    linearize: bool
    pdf_version: str | None
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS


def _quality_to_qfactor(quality: int) -> float:
    if quality >= 90:
        return 0.13
    if quality >= 75:
        return 0.4
    if quality >= 55:
        return 0.76
    if quality >= 30:
        return 1.3
    return 1.8


def _dpi_for_dimension(max_dim: int | None) -> int:
    if max_dim is None or max_dim <= 0:
        return 300
    return max(36, min(600, math.floor(max_dim / _DEFAULT_PAGE_INCHES)))


def _normalize_pdf_version(version: str | None) -> str:
    if version is None or version not in _PDF_VERSIONS:
        return "1.7"
    return version


def _color_strategy(color_mode: str) -> str:
    if color_mode == "grayscale":
        return "/Gray"
    return "/LeaveColorUnchanged"


def _build_args(inputs: GsCompressInputs, caps: GsCapabilities) -> list[str]:
    color_dpi = _dpi_for_dimension(inputs.image_max_dimension)
    qfactor = _quality_to_qfactor(inputs.image_quality)
    color_strategy = _color_strategy(inputs.color_mode)
    pdf_version = _normalize_pdf_version(inputs.pdf_version)
    mono_filter = "/JBIG2Encode" if caps.has_jbig2 else "/CCITTFaxEncode"

    prologue = (
        "<< "
        f"/ColorImageDict << /QFactor {qfactor:.2f} "
        "/HSamples [2 1 1 2] /VSamples [2 1 1 2] >> "
        f"/GrayImageDict << /QFactor {qfactor:.2f} "
        "/HSamples [2 1 1 2] /VSamples [2 1 1 2] >> "
        ">> setdistillerparams"
    )

    args: list[str] = [
        caps.binary,
        "-sDEVICE=pdfwrite",
        "-dSAFER",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        f"-dCompatibilityLevel={pdf_version}",
        "-dPDFSETTINGS=/printer",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dEmbedAllFonts=true",
        "-dSubsetFonts=true",
        f"-dColorConversionStrategy={color_strategy}",
        "-dAutoFilterColorImages=false",
        "-dAutoFilterGrayImages=false",
        "-dColorImageFilter=/DCTEncode",
        "-dGrayImageFilter=/DCTEncode",
        f"-dMonoImageFilter={mono_filter}",
        "-dDownsampleColorImages=true",
        "-dColorImageDownsampleType=/Bicubic",
        f"-dColorImageResolution={color_dpi}",
        "-dColorImageDownsampleThreshold=1.0",
        "-dDownsampleGrayImages=true",
        "-dGrayImageDownsampleType=/Bicubic",
        f"-dGrayImageResolution={color_dpi}",
        "-dGrayImageDownsampleThreshold=1.0",
        "-dDownsampleMonoImages=true",
        "-dMonoImageDownsampleType=/Subsample",
        f"-dMonoImageResolution={max(300, color_dpi)}",
    ]
    if inputs.linearize:
        args.append("-dFastWebView=true")
    args.extend(
        [
            f"-sOutputFile={inputs.output_path}",
            "-c",
            prologue,
            "-f",
            str(inputs.input_path),
        ]
    )
    return args


@dataclass(slots=True, frozen=True)
class GsCompressResult:
    output_size_bytes: int
    input_size_bytes: int
    gs_version: str


def gs_compress(inputs: GsCompressInputs) -> GsCompressResult:
    caps = ensure_gs_runtime()
    if not inputs.input_path.exists():
        raise FileNotFoundError(str(inputs.input_path))
    if inputs.input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    inputs.output_path.parent.mkdir(parents=True, exist_ok=True)

    args = _build_args(inputs, caps)
    try:
        completed = run_capture(args, timeout=inputs.timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        raise PdfMalformedError(
            "Ghostscript took too long to compress this PDF.",
        ) from exc
    except OSError as exc:
        raise GsNotConfiguredError(
            "Ghostscript failed to start.",
            details={"error": str(exc)},
        ) from exc

    if completed.returncode != 0:
        message = (completed.stderr or completed.stdout or "Ghostscript failed.").strip()[:500]
        lowered = message.lower()
        if "password" in lowered or "encrypted" in lowered:
            raise PdfEncryptedError(
                "This PDF is password-protected. Remove the password and try again.",
            )
        raise PdfMalformedError(
            "Ghostscript could not compress this PDF.",
            details={"return_code": completed.returncode, "stderr": message},
        )

    if not inputs.output_path.exists() or inputs.output_path.stat().st_size == 0:
        raise PdfMalformedError("Ghostscript produced an empty output.")

    return GsCompressResult(
        output_size_bytes=inputs.output_path.stat().st_size,
        input_size_bytes=inputs.input_path.stat().st_size,
        gs_version=caps.version,
    )


__all__ = [
    "GsCompressInputs",
    "GsCompressResult",
    "gs_compress",
]
