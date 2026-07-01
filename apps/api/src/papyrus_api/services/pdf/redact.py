from __future__ import annotations

import io
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import pikepdf
from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.limits import enforce_page_cap
from papyrus_api.services.pdf.rasterize import open_document, render_page


@dataclass(slots=True, frozen=True)
class RedactRect:
    x: float
    y: float
    w: float
    h: float


@dataclass(slots=True, frozen=True)
class RedactResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    pages_redacted: int
    boxes_applied: int


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def redactions_from_payload(raw: object) -> dict[int, list[RedactRect]]:
    if not isinstance(raw, list):
        raise ValidationError("Redaction areas are required.")
    result: dict[int, list[RedactRect]] = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            page = int(entry.get("page", 0))
        except (TypeError, ValueError):
            continue
        if page < 1:
            continue
        try:
            rect = RedactRect(
                x=_clamp01(float(entry["x"])),
                y=_clamp01(float(entry["y"])),
                w=_clamp01(float(entry["w"])),
                h=_clamp01(float(entry["h"])),
            )
        except (KeyError, TypeError, ValueError):
            continue
        if rect.w <= 0 or rect.h <= 0:
            continue
        result.setdefault(page, []).append(rect)
    if not result:
        raise ValidationError("At least one valid redaction area is required.")
    return result


def _flatten_page_image(
    image: Image.Image,
    rects: Sequence[RedactRect],
) -> Image.Image:
    draw = ImageDraw.Draw(image)
    px_w, px_h = image.size
    for rect in rects:
        x0 = int(rect.x * px_w)
        y0 = int(rect.y * px_h)
        x1 = int((rect.x + rect.w) * px_w)
        y1 = int((rect.y + rect.h) * px_h)
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
    return image


def _image_to_page_pdf(image: Image.Image, width_pt: float, height_pt: float) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width_pt, height_pt))
    c.drawImage(
        ImageReader(image),
        0,
        0,
        width=width_pt,
        height=height_pt,
        preserveAspectRatio=False,
        anchor="sw",
    )
    c.showPage()
    c.save()
    return buffer.getvalue()


def redact_pdf(
    *,
    input_path: Path,
    output_path: Path,
    redactions: Mapping[int, Sequence[RedactRect]],
    dpi: int = 200,
    max_megapixels: int = 40,
    max_pages: int | None = None,
) -> RedactResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("This PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    doc = open_document(input_path)
    out = pikepdf.Pdf.new()
    page_pdfs: list[pikepdf.Pdf] = []
    pages_redacted = 0
    boxes_applied = 0
    try:
        page_count = len(src.pages)
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")
        enforce_page_cap(page_count, max_pages)

        for index in range(page_count):
            page_no = index + 1
            rects = redactions.get(page_no)
            if rects:
                mb = src.pages[index].mediabox
                width_pt = float(mb[2]) - float(mb[0])
                height_pt = float(mb[3]) - float(mb[1])
                image = render_page(doc, index, dpi=dpi, max_megapixels=max_megapixels)
                try:
                    _flatten_page_image(image, rects)
                    page_bytes = _image_to_page_pdf(image, width_pt, height_pt)
                finally:
                    image.close()
                page_pdf = pikepdf.open(io.BytesIO(page_bytes))
                page_pdfs.append(page_pdf)
                out.pages.append(page_pdf.pages[0])
                pages_redacted += 1
                boxes_applied += len(rects)
            else:
                out.pages.append(src.pages[index])

        out.save(
            str(output_path),
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )
    finally:
        for page_pdf in page_pdfs:
            page_pdf.close()
        out.close()
        doc.close()
        src.close()

    return RedactResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        pages_redacted=pages_redacted,
        boxes_applied=boxes_applied,
    )


__all__ = ["RedactRect", "RedactResult", "redact_pdf", "redactions_from_payload"]
