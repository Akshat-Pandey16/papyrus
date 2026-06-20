from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from papyrus_api.core.errors import PdfMalformedError
from papyrus_api.services.pdf.limits import enforce_page_cap
from papyrus_api.services.pdf.rasterize import open_document, render_page


class ImageFormat(StrEnum):
    JPEG = "jpeg"
    PNG = "png"


@dataclass(slots=True, frozen=True)
class PdfToImagesResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    images: int
    image_format: str


def _encode(image: object, fmt: ImageFormat, quality: int) -> bytes:
    from PIL import Image

    assert isinstance(image, Image.Image)
    buffer = io.BytesIO()
    if fmt is ImageFormat.JPEG:
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
    else:
        image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def pdf_to_images(
    *,
    input_path: Path,
    output_path: Path,
    image_format: ImageFormat = ImageFormat.JPEG,
    dpi: int = 150,
    quality: int = 85,
    max_pages: int | None = None,
    max_megapixels: int = 40,
) -> PdfToImagesResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size
    ext = "jpg" if image_format is ImageFormat.JPEG else "png"

    doc = open_document(input_path)
    rendered = 0
    try:
        page_count = len(doc)
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")
        enforce_page_cap(page_count, max_pages)

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_STORED) as zf:
            for index in range(page_count):
                image = render_page(
                    doc,
                    index,
                    dpi=dpi,
                    max_megapixels=max_megapixels,
                )
                try:
                    data = _encode(image, image_format, quality)
                finally:
                    image.close()
                zf.writestr(f"page-{index + 1:04d}.{ext}", data)
                rendered += 1
    finally:
        doc.close()

    return PdfToImagesResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        images=rendered,
        image_format=image_format.value,
    )


__all__ = ["ImageFormat", "PdfToImagesResult", "pdf_to_images"]
