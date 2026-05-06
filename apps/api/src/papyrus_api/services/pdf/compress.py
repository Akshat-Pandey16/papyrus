from __future__ import annotations

import contextlib
import io
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Protocol

import pikepdf
from PIL import Image

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError


class CompressionLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(slots=True, frozen=True)
class CompressResult:
    output_path: Path
    input_size_bytes: int
    output_size_bytes: int
    ratio: float
    page_count: int


ProgressCallback = Callable[[str], None] | None


class CompressionStrategy(Protocol):
    def compress(
        self,
        *,
        input_path: Path,
        output_path: Path,
        level: CompressionLevel,
        progress: ProgressCallback,
    ) -> CompressResult: ...


_JPEG_QUALITY = {
    CompressionLevel.LOW: 90,
    CompressionLevel.MEDIUM: 80,
    CompressionLevel.HIGH: 70,
}


def _emit(progress: ProgressCallback, label: str) -> None:
    if progress is not None:
        with contextlib.suppress(Exception):
            progress(label)


def _maybe_recompress_image(
    image_obj: pikepdf.PdfImage,
    quality: int,
) -> bool:
    try:
        pil_img = image_obj.as_pil_image()
    except Exception:
        return False

    if pil_img.mode not in ("RGB", "L", "CMYK"):
        try:
            pil_img = pil_img.convert("RGB")
        except Exception:
            return False

    buffer = io.BytesIO()
    try:
        pil_img.save(buffer, format="JPEG", quality=quality, optimize=True)
    except Exception:
        return False

    new_bytes = buffer.getvalue()
    try:
        existing = image_obj.obj.read_raw_bytes()
    except Exception:
        existing = b""

    if existing and len(new_bytes) >= len(existing):
        return False

    try:
        image_obj.obj.write(
            new_bytes,
            filter=pikepdf.Name.DCTDecode,
            decode_parms=pikepdf.Dictionary(),
        )
    except Exception:
        return False
    return True


class PikepdfStrategy:
    def compress(
        self,
        *,
        input_path: Path,
        output_path: Path,
        level: CompressionLevel,
        progress: ProgressCallback,
    ) -> CompressResult:
        input_size = input_path.stat().st_size
        _emit(progress, "opening")

        try:
            pdf = pikepdf.open(str(input_path))
        except pikepdf.PasswordError as exc:
            raise PdfEncryptedError(
                "This PDF is password-protected. Remove the password and try again.",
            ) from exc
        except pikepdf.PdfError as exc:
            raise PdfMalformedError(
                "This PDF appears to be malformed and cannot be processed.",
            ) from exc

        try:
            page_count = len(pdf.pages)

            if level is CompressionLevel.HIGH:
                _emit(progress, "recompressing_images")
                quality = _JPEG_QUALITY[level]
                for page in pdf.pages:
                    try:
                        for raw in page.images.values():
                            try:
                                image_obj = pikepdf.PdfImage(raw)
                            except Exception:
                                continue
                            _maybe_recompress_image(image_obj, quality)
                    except Exception:
                        continue

            _emit(progress, "saving")
            save_kwargs: dict[str, object] = {
                "linearize": False,
                "compress_streams": True,
                "recompress_flate": level is not CompressionLevel.LOW,
            }
            if level is CompressionLevel.LOW:
                save_kwargs["object_stream_mode"] = pikepdf.ObjectStreamMode.preserve
            else:
                save_kwargs["object_stream_mode"] = pikepdf.ObjectStreamMode.generate

            try:
                pdf.save(str(output_path), **save_kwargs)
            except pikepdf.PdfError as exc:
                raise PdfMalformedError(
                    "The PDF could not be re-encoded. It may be malformed.",
                ) from exc
        finally:
            pdf.close()

        output_size = output_path.stat().st_size
        ratio = output_size / input_size if input_size > 0 else 0.0
        _emit(progress, "saved")
        return CompressResult(
            output_path=output_path,
            input_size_bytes=input_size,
            output_size_bytes=output_size,
            ratio=ratio,
            page_count=page_count,
        )


_strategy: CompressionStrategy = PikepdfStrategy()


def compress_pdf(
    *,
    input_path: Path,
    output_path: Path,
    level: CompressionLevel,
    progress: ProgressCallback = None,
) -> CompressResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = Image
    return _strategy.compress(
        input_path=input_path,
        output_path=output_path,
        level=level,
        progress=progress,
    )
