from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError
from papyrus_api.services.pdf._subprocess import run_capture
from papyrus_api.services.pdf.gs_runtime import ensure_gs_runtime
from papyrus_api.services.pdf.limits import enforce_page_cap

_PDFA_TIMEOUT_SECONDS = 600

_DEF_GLOBS = (
    "/usr/share/ghostscript/*/lib/PDFA_def.ps",
    "/usr/share/ghostscript/*/Resource/**/PDFA_def.ps",
    "/usr/local/share/ghostscript/*/lib/PDFA_def.ps",
    "/usr/local/share/ghostscript/*/Resource/**/PDFA_def.ps",
    "/opt/homebrew/share/ghostscript/*/lib/PDFA_def.ps",
)

_ICC_GLOBS = (
    "/usr/share/color/icc/ghostscript/srgb.icc",
    "/usr/share/color/icc/ghostscript/*.icc",
    "/usr/share/color/icc/sRGB.icc",
    "/usr/share/color/icc/**/sRGB*.icc",
    "/usr/share/ghostscript/*/iccprofiles/srgb.icc",
    "/usr/local/share/ghostscript/*/iccprofiles/srgb.icc",
)


def _first_match(patterns: tuple[str, ...]) -> Path | None:
    for pattern in patterns:
        for candidate in sorted(Path("/").glob(pattern.lstrip("/"))):
            if candidate.is_file():
                return candidate
    return None


def _locate_pdfa_def() -> Path | None:
    return _first_match(_DEF_GLOBS)


def _locate_srgb_icc() -> Path | None:
    return _first_match(_ICC_GLOBS)


@dataclass(slots=True, frozen=True)
class PdfaResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def _write_def_with_icc(*, def_source: Path, icc_path: Path, target: Path) -> None:
    text = def_source.read_text(encoding="latin-1")
    patched = text.replace("(srgb.icc)", f"({icc_path})")
    target.write_text(patched, encoding="latin-1")


def pdfa_pdf(
    *,
    input_path: Path,
    output_path: Path,
    max_pages: int | None = None,
) -> PdfaResult:
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

    def_source = _locate_pdfa_def()
    icc_path = _locate_srgb_icc()

    cmd = [
        caps.binary,
        "-dPDFA=2",
        "-dBATCH",
        "-dNOPAUSE",
        "-dSAFER",
        "-dNOOUTERSAVE",
        "-sColorConversionStrategy=UseDeviceIndependentColor",
        "-sDEVICE=pdfwrite",
        "-dPDFACompatibilityPolicy=1",
        f"-sOutputFile={output_path}",
    ]

    if def_source is not None and icc_path is not None:
        def_file = output_path.parent / f"{output_path.stem}.pdfa_def.ps"
        _write_def_with_icc(def_source=def_source, icc_path=icc_path, target=def_file)
        cmd.insert(4, f"--permit-file-read={icc_path}")
        cmd.extend([str(def_file), str(input_path)])
    else:
        def_file = None
        cmd.append(str(input_path))

    try:
        result = run_capture(cmd, timeout=_PDFA_TIMEOUT_SECONDS)
    finally:
        if def_file is not None:
            def_file.unlink(missing_ok=True)

    if result.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        raise ValidationError("Could not convert this PDF to PDF/A.")

    try:
        with pikepdf.open(str(output_path)) as pdf:
            page_count = len(pdf.pages)
    except pikepdf.PdfError as exc:
        raise ValidationError("Could not convert this PDF to PDF/A.") from exc

    return PdfaResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
    )


__all__ = ["PdfaResult", "pdfa_pdf"]
