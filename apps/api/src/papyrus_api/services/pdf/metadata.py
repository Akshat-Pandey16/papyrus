from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf
from pikepdf.models.metadata import PdfMetadata

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError


@dataclass(slots=True, frozen=True)
class MetadataResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    stripped: bool


def _assign(meta: PdfMetadata, key: str, value: str | list[str] | None) -> None:
    if value is None:
        return
    if not value:
        if key in meta:
            del meta[key]
        return
    meta[key] = value


def set_metadata_pdf(
    *,
    input_path: Path,
    output_path: Path,
    title: str | None,
    author: str | None,
    subject: str | None,
    keywords: str | None,
    strip_all: bool,
) -> MetadataResult:
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with pikepdf.open(str(input_path)) as pdf:
            if strip_all:
                if pikepdf.Name.Info in pdf.trailer:
                    del pdf.trailer.Info
                if pikepdf.Name.Metadata in pdf.Root:
                    del pdf.Root.Metadata
            else:
                with pdf.open_metadata() as meta:
                    meta.load_from_docinfo(pdf.docinfo)
                    _assign(meta, "dc:title", title)
                    _assign(meta, "dc:creator", [author] if author else author)
                    _assign(meta, "dc:description", subject)
                    _assign(meta, "pdf:Keywords", keywords)
            pdf.save(str(output_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    with pikepdf.open(str(output_path)) as reopened:
        page_count = len(reopened.pages)

    return MetadataResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
        stripped=strip_all,
    )


__all__ = ["MetadataResult", "set_metadata_pdf"]
