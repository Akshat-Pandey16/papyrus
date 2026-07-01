from __future__ import annotations

from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError


def open_document(input_path: Path, *, password: str | None = None) -> pdfium.PdfDocument:
    try:
        return pdfium.PdfDocument(str(input_path), password=password)
    except pdfium.PdfiumError as exc:
        message = str(exc).lower()
        if "password" in message:
            raise PdfEncryptedError("This PDF is password-protected.") from exc
        raise PdfMalformedError("This PDF appears to be malformed.") from exc


def page_size_points(doc: pdfium.PdfDocument, index: int) -> tuple[float, float]:
    page = doc[index]
    try:
        width, height = page.get_size()
        return float(width), float(height)
    finally:
        page.close()


def render_page(
    doc: pdfium.PdfDocument,
    index: int,
    *,
    dpi: int,
    max_megapixels: int,
) -> Image.Image:
    page = doc[index]
    try:
        width_pt, height_pt = page.get_size()
        scale = max(0.1, dpi / 72.0)
        px_w = float(width_pt) * scale
        px_h = float(height_pt) * scale
        megapixels = (px_w * px_h) / 1_000_000.0
        if max_megapixels > 0 and megapixels > max_megapixels:
            scale *= (max_megapixels / megapixels) ** 0.5
        bitmap = page.render(scale=scale, draw_annots=True)
        try:
            image: Image.Image = bitmap.to_pil()
        finally:
            bitmap.close()
        if image.mode != "RGB":
            converted: Image.Image = image.convert("RGB")
            image.close()
            return converted
        return image
    finally:
        page.close()


__all__ = ["open_document", "page_size_points", "render_page"]
