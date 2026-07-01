from __future__ import annotations

import contextlib
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import img2pdf
from PIL import Image, ImageOps

from papyrus_api.core.errors import ImageInvalidError, ValidationError

_PASSTHROUGH_SUFFIXES = frozenset({".jpg", ".jpeg", ".png"})


class PageSize(StrEnum):
    AUTO = "auto"
    A4 = "a4"
    LETTER = "letter"


@dataclass(slots=True, frozen=True)
class ImagesToPdfResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int


def _has_exif_rotation(image: Image.Image) -> bool:
    try:
        orientation = image.getexif().get(0x0112)
    except Exception:
        return False
    return orientation not in (None, 1)


def _normalize(src: Path, dest_dir: Path, index: int) -> Path:
    try:
        with Image.open(src) as image:
            image.load()
            mode = image.mode
            needs_fix = mode not in ("RGB", "L") or _has_exif_rotation(image)
            if not needs_fix and src.suffix.lower() in _PASSTHROUGH_SUFFIXES:
                return src
            fixed = ImageOps.exif_transpose(image)
            had_alpha = fixed.mode in ("RGBA", "LA", "PA") or (
                fixed.mode == "P" and "transparency" in fixed.info
            )
            if had_alpha:
                rgba = fixed.convert("RGBA")
                background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                flat = Image.alpha_composite(background, rgba).convert("RGB")
                out = dest_dir / f"img-{index:04d}.png"
                flat.save(out, format="PNG", optimize=True)
                return out
            rgb = fixed.convert("RGB") if fixed.mode != "RGB" else fixed
            out = dest_dir / f"img-{index:04d}.jpg"
            rgb.save(out, format="JPEG", quality=92, optimize=True)
            return out
    except (OSError, ValueError) as exc:
        raise ImageInvalidError(
            "One of the images could not be read.",
            details={"index": index},
        ) from exc


def _layout_fun(page_size: PageSize) -> object:
    if page_size is PageSize.A4:
        return img2pdf.get_layout_fun((img2pdf.mm_to_pt(210), img2pdf.mm_to_pt(297)))
    if page_size is PageSize.LETTER:
        return img2pdf.get_layout_fun((img2pdf.in_to_pt(8.5), img2pdf.in_to_pt(11)))
    return None


def images_to_pdf(
    *,
    image_paths: Sequence[Path],
    output_path: Path,
    work_dir: Path,
    page_size: PageSize = PageSize.AUTO,
) -> ImagesToPdfResult:
    if not image_paths:
        raise ValidationError("At least one image is required.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    input_size = sum(p.stat().st_size for p in image_paths if p.exists())

    normalized: list[str] = []
    for index, src in enumerate(image_paths):
        if not src.exists() or src.stat().st_size == 0:
            raise ImageInvalidError("One of the images is empty.", details={"index": index})
        normalized.append(str(_normalize(src, work_dir, index)))

    layout = _layout_fun(page_size)
    try:
        with output_path.open("wb") as fh:
            if layout is None:
                fh.write(img2pdf.convert(normalized))
            else:
                fh.write(img2pdf.convert(normalized, layout_fun=layout))
    except (img2pdf.ImageOpenError, ValueError, OSError) as exc:
        with contextlib.suppress(OSError):
            output_path.unlink(missing_ok=True)
        raise ImageInvalidError("The images could not be combined into a PDF.") from exc

    return ImagesToPdfResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=len(normalized),
    )


__all__ = ["ImagesToPdfResult", "PageSize", "images_to_pdf"]
