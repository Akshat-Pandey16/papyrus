from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError
from papyrus_api.services.pdf.limits import enforce_page_cap

_PAGE_SEPARATOR = "\f"


@dataclass(slots=True, frozen=True)
class ExtractTextResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    char_count: int


def extract_text_pdf(
    *,
    input_path: Path,
    output_path: Path,
    max_pages: int | None = None,
) -> ExtractTextResult:
    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    try:
        doc = pdfium.PdfDocument(str(input_path))
    except pdfium.PdfiumError as exc:
        message = str(exc).lower()
        if "password" in message:
            raise PdfEncryptedError("PDF is password-protected.") from exc
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    try:
        page_count = len(doc)
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")
        enforce_page_cap(page_count, max_pages)

        pages: list[str] = []
        for index in range(page_count):
            page = doc[index]
            try:
                text_page = page.get_textpage()
                try:
                    pages.append(text_page.get_text_range())
                finally:
                    text_page.close()
            finally:
                page.close()
    except pdfium.PdfiumError as exc:
        raise ValidationError("Could not extract text from this PDF.") from exc
    finally:
        doc.close()

    text = _PAGE_SEPARATOR.join(pages)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")

    return ExtractTextResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
        char_count=len(text),
    )


__all__ = ["ExtractTextResult", "extract_text_pdf"]
