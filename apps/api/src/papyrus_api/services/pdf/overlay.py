from __future__ import annotations

import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import pikepdf
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from papyrus_api.core.errors import (
    PdfEncryptedError,
    PdfMalformedError,
    ValidationError,
)
from papyrus_api.services.pdf.limits import enforce_page_cap

_STANDARD_FONTS = frozenset(
    {
        "Helvetica",
        "Helvetica-Bold",
        "Helvetica-Oblique",
        "Helvetica-BoldOblique",
        "Times-Roman",
        "Times-Bold",
        "Times-Italic",
        "Courier",
        "Courier-Bold",
    }
)

RGB = tuple[float, float, float]


@dataclass(slots=True, frozen=True)
class TextOp:
    page: int
    text: str
    x: float
    y: float
    size: float
    color: RGB = (0.0, 0.0, 0.0)
    opacity: float = 1.0
    rotation: float = 0.0
    font: str = "Helvetica"
    align: str = "left"


@dataclass(slots=True, frozen=True)
class ImageOp:
    page: int
    image_ref: str
    x: float
    y: float
    w: float
    h: float
    opacity: float = 1.0


@dataclass(slots=True, frozen=True)
class RectOp:
    page: int
    x: float
    y: float
    w: float
    h: float
    fill: RGB | None = None
    stroke: RGB | None = None
    stroke_width: float = 1.0
    opacity: float = 1.0


@dataclass(slots=True, frozen=True)
class LineOp:
    page: int
    points: tuple[tuple[float, float], ...]
    stroke: RGB = (0.0, 0.0, 0.0)
    stroke_width: float = 1.5
    opacity: float = 1.0


PageOp = TextOp | ImageOp | RectOp | LineOp


@dataclass(slots=True, frozen=True)
class OverlayResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    ops_applied: int


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _rgb(raw: object, *, default: RGB = (0.0, 0.0, 0.0)) -> RGB:
    if isinstance(raw, (list, tuple)) and len(raw) == 3:
        try:
            return (
                _clamp01(float(raw[0])),
                _clamp01(float(raw[1])),
                _clamp01(float(raw[2])),
            )
        except (TypeError, ValueError):
            return default
    return default


def _font(raw: object) -> str:
    if isinstance(raw, str) and raw in _STANDARD_FONTS:
        return raw
    return "Helvetica"


def _num(raw: object, default: float = 0.0) -> float:
    if isinstance(raw, bool):
        return default
    if isinstance(raw, (int, float)):
        return float(raw)
    return default


def ops_from_payload(raw: Sequence[object], *, max_ops: int) -> list[PageOp]:
    if len(raw) > max_ops:
        raise ValidationError(
            "Too many edit operations in one job.",
            details={"max_ops": max_ops, "count": len(raw)},
        )
    ops: list[PageOp] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        kind = entry.get("type")
        try:
            page = int(entry.get("page", 0))
        except (TypeError, ValueError):
            continue
        if page < 1:
            continue
        if kind == "text":
            text = entry.get("text")
            if not isinstance(text, str) or not text:
                continue
            ops.append(
                TextOp(
                    page=page,
                    text=text[:2000],
                    x=_clamp01(_num(entry.get("x"))),
                    y=_clamp01(_num(entry.get("y"))),
                    size=max(1.0, min(400.0, _num(entry.get("size"), 16.0))),
                    color=_rgb(entry.get("color")),
                    opacity=_clamp01(_num(entry.get("opacity"), 1.0)),
                    rotation=_num(entry.get("rotation")),
                    font=_font(entry.get("font")),
                    align=str(entry.get("align", "left")),
                )
            )
        elif kind == "image":
            ref = entry.get("image_ref")
            if not isinstance(ref, str) or not ref:
                continue
            ops.append(
                ImageOp(
                    page=page,
                    image_ref=ref,
                    x=_clamp01(_num(entry.get("x"))),
                    y=_clamp01(_num(entry.get("y"))),
                    w=_clamp01(_num(entry.get("w"), 0.2)),
                    h=_clamp01(_num(entry.get("h"), 0.1)),
                    opacity=_clamp01(_num(entry.get("opacity"), 1.0)),
                )
            )
        elif kind == "rect":
            fill = _rgb(entry.get("fill")) if entry.get("fill") is not None else None
            stroke = _rgb(entry.get("stroke")) if entry.get("stroke") is not None else None
            ops.append(
                RectOp(
                    page=page,
                    x=_clamp01(_num(entry.get("x"))),
                    y=_clamp01(_num(entry.get("y"))),
                    w=_clamp01(_num(entry.get("w"), 0.1)),
                    h=_clamp01(_num(entry.get("h"), 0.05)),
                    fill=fill,
                    stroke=stroke,
                    stroke_width=max(0.1, min(40.0, _num(entry.get("stroke_width"), 1.0))),
                    opacity=_clamp01(_num(entry.get("opacity"), 1.0)),
                )
            )
        elif kind == "line":
            raw_points = entry.get("points")
            if not isinstance(raw_points, (list, tuple)) or len(raw_points) < 2:
                continue
            points: list[tuple[float, float]] = [
                (_clamp01(_num(pt[0])), _clamp01(_num(pt[1])))
                for pt in raw_points
                if isinstance(pt, (list, tuple)) and len(pt) == 2
            ]
            if len(points) < 2:
                continue
            ops.append(
                LineOp(
                    page=page,
                    points=tuple(points[:2000]),
                    stroke=_rgb(entry.get("stroke")),
                    stroke_width=max(0.1, min(40.0, _num(entry.get("stroke_width"), 1.5))),
                    opacity=_clamp01(_num(entry.get("opacity"), 1.0)),
                )
            )
    return ops


def _visible_dims(page: pikepdf.Page) -> tuple[float, float]:
    box = page.mediabox
    width = float(box[2]) - float(box[0])
    height = float(box[3]) - float(box[1])
    rotate = 0
    try:
        rotate = int(page.obj.get("/Rotate", 0)) % 360
    except (TypeError, ValueError):
        rotate = 0
    if rotate in (90, 270):
        return height, width
    return width, height


def _draw_text(c: canvas.Canvas, op: TextOp, w: float, h: float) -> None:
    c.saveState()
    c.setFillColorRGB(*op.color, alpha=op.opacity)
    c.translate(op.x * w, (1.0 - op.y) * h)
    if op.rotation:
        c.rotate(op.rotation)
    c.setFont(op.font, op.size)
    if op.align == "center":
        c.drawCentredString(0, 0, op.text)
    elif op.align == "right":
        c.drawRightString(0, 0, op.text)
    else:
        c.drawString(0, 0, op.text)
    c.restoreState()


def _draw_image(
    c: canvas.Canvas,
    op: ImageOp,
    images: Mapping[str, Path],
    w: float,
    h: float,
) -> bool:
    path = images.get(op.image_ref)
    if path is None or not path.exists():
        return False
    px = op.x * w
    pw = op.w * w
    ph = op.h * h
    py = (1.0 - (op.y + op.h)) * h
    c.saveState()
    if op.opacity < 1.0:
        c.setFillAlpha(op.opacity)
    c.drawImage(
        ImageReader(str(path)),
        px,
        py,
        width=pw,
        height=ph,
        mask="auto",
        preserveAspectRatio=True,
        anchor="sw",
    )
    c.restoreState()
    return True


def _draw_rect(c: canvas.Canvas, op: RectOp, w: float, h: float) -> None:
    px = op.x * w
    pw = op.w * w
    ph = op.h * h
    py = (1.0 - (op.y + op.h)) * h
    c.saveState()
    fill = 0
    stroke = 0
    if op.fill is not None:
        c.setFillColorRGB(*op.fill, alpha=op.opacity)
        fill = 1
    if op.stroke is not None:
        c.setStrokeColorRGB(*op.stroke, alpha=op.opacity)
        c.setLineWidth(op.stroke_width)
        stroke = 1
    if fill or stroke:
        c.rect(px, py, pw, ph, fill=fill, stroke=stroke)
    c.restoreState()


def _draw_line(c: canvas.Canvas, op: LineOp, w: float, h: float) -> None:
    c.saveState()
    c.setStrokeColorRGB(*op.stroke, alpha=op.opacity)
    c.setLineWidth(op.stroke_width)
    c.setLineCap(1)
    c.setLineJoin(1)
    path = c.beginPath()
    first = op.points[0]
    path.moveTo(first[0] * w, (1.0 - first[1]) * h)
    for pt in op.points[1:]:
        path.lineTo(pt[0] * w, (1.0 - pt[1]) * h)
    c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def _build_overlay_page(
    dest: Path,
    *,
    width: float,
    height: float,
    ops: Sequence[PageOp],
    images: Mapping[str, Path],
) -> int:
    c = canvas.Canvas(str(dest), pagesize=(width, height))
    applied = 0
    for op in ops:
        if isinstance(op, TextOp):
            _draw_text(c, op, width, height)
            applied += 1
        elif isinstance(op, ImageOp):
            if _draw_image(c, op, images, width, height):
                applied += 1
        elif isinstance(op, RectOp):
            _draw_rect(c, op, width, height)
            applied += 1
        elif isinstance(op, LineOp):
            _draw_line(c, op, width, height)
            applied += 1
    c.showPage()
    c.save()
    return applied


def apply_overlay(
    *,
    input_path: Path,
    output_path: Path,
    ops: Sequence[PageOp],
    images: Mapping[str, Path] | None = None,
    password: str | None = None,
    max_pages: int | None = None,
) -> OverlayResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size
    images = images or {}

    by_page: dict[int, list[PageOp]] = {}
    for op in ops:
        by_page.setdefault(op.page, []).append(op)

    try:
        pdf = pikepdf.open(str(input_path), password=password or "")
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("This PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    overlays: list[pikepdf.Pdf] = []
    applied_total = 0
    try:
        page_count = len(pdf.pages)
        if page_count == 0:
            raise PdfMalformedError("PDF has no pages.")
        enforce_page_cap(page_count, max_pages)

        with tempfile.TemporaryDirectory(prefix="papyrus-overlay-") as tmp_root:
            tmp_dir = Path(tmp_root)
            for page_no, page_ops in by_page.items():
                if page_no < 1 or page_no > page_count:
                    continue
                page = pdf.pages[page_no - 1]
                width, height = _visible_dims(page)
                if width <= 0 or height <= 0:
                    continue
                overlay_path = tmp_dir / f"overlay-{page_no:05d}.pdf"
                applied_total += _build_overlay_page(
                    overlay_path,
                    width=width,
                    height=height,
                    ops=page_ops,
                    images=images,
                )
                overlay_pdf = pikepdf.open(str(overlay_path))
                overlays.append(overlay_pdf)
                page.add_overlay(overlay_pdf.pages[0], None)

            pdf.save(
                str(output_path),
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )
    finally:
        for overlay_pdf in overlays:
            overlay_pdf.close()
        pdf.close()

    return OverlayResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        ops_applied=applied_total,
    )


__all__ = [
    "ImageOp",
    "LineOp",
    "OverlayResult",
    "PageOp",
    "RectOp",
    "TextOp",
    "apply_overlay",
    "ops_from_payload",
]
