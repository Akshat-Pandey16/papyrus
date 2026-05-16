from __future__ import annotations

import contextlib
import io
import math
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from enum import StrEnum
from pathlib import Path
from typing import Any

import pikepdf
from PIL import Image, ImageFile, UnidentifiedImageError

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError

ImageFile.LOAD_TRUNCATED_IMAGES = False
_MAX_IMAGE_PIXELS = 100_000_000
Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS


class CompressionLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"
    CUSTOM = "custom"


class ColorMode(StrEnum):
    PRESERVE = "preserve"
    GRAYSCALE = "grayscale"


class ObjectStreamMode(StrEnum):
    PRESERVE = "preserve"
    GENERATE = "generate"
    DISABLE = "disable"


class CompressionEngine(StrEnum):
    PIKEPDF = "pikepdf"
    GHOSTSCRIPT = "ghostscript"


_ALLOWED_PDF_VERSIONS = frozenset({"1.4", "1.5", "1.6", "1.7"})


@dataclass(slots=True, frozen=True)
class CompressOptions:
    engine: CompressionEngine = CompressionEngine.PIKEPDF
    recompress_images: bool = True
    image_quality: int = 80
    image_max_dimension: int | None = None
    color_mode: ColorMode = ColorMode.PRESERVE
    recompress_streams: bool = True
    object_stream_mode: ObjectStreamMode = ObjectStreamMode.GENERATE
    strip_metadata: bool = False
    discard_javascript: bool = False
    discard_forms: bool = False
    discard_annotations: bool = False
    discard_bookmarks: bool = False
    discard_attachments: bool = False
    discard_thumbnails: bool = False
    linearize: bool = False
    pdf_version: str | None = None


@dataclass(slots=True, frozen=True)
class CompressResult:
    output_path: Path
    input_size_bytes: int
    output_size_bytes: int
    ratio: float
    page_count: int
    images_processed: int
    images_recompressed: int
    images_downsampled: int
    metadata_stripped: bool
    engine: CompressionEngine = CompressionEngine.PIKEPDF
    gs_version: str | None = None
    options_applied: dict[str, Any] = field(default_factory=dict)


ProgressCallback = Callable[[str], None] | None

_PRESETS: dict[CompressionLevel, CompressOptions] = {
    CompressionLevel.LOW: CompressOptions(
        recompress_images=False,
        recompress_streams=True,
        object_stream_mode=ObjectStreamMode.PRESERVE,
    ),
    CompressionLevel.MEDIUM: CompressOptions(
        recompress_images=True,
        image_quality=82,
        image_max_dimension=2400,
        color_mode=ColorMode.PRESERVE,
        recompress_streams=True,
        object_stream_mode=ObjectStreamMode.GENERATE,
        strip_metadata=False,
    ),
    CompressionLevel.HIGH: CompressOptions(
        recompress_images=True,
        image_quality=72,
        image_max_dimension=1600,
        color_mode=ColorMode.PRESERVE,
        recompress_streams=True,
        object_stream_mode=ObjectStreamMode.GENERATE,
        strip_metadata=True,
        discard_thumbnails=True,
    ),
    CompressionLevel.EXTREME: CompressOptions(
        recompress_images=True,
        image_quality=55,
        image_max_dimension=1100,
        color_mode=ColorMode.GRAYSCALE,
        recompress_streams=True,
        object_stream_mode=ObjectStreamMode.GENERATE,
        strip_metadata=True,
        discard_javascript=True,
        discard_attachments=True,
        discard_thumbnails=True,
    ),
}

_MIN_IMAGE_PIXELS_TO_TOUCH = 64 * 64
_PILLOW_MODE_FOR = {
    ColorMode.PRESERVE: None,
    ColorMode.GRAYSCALE: "L",
}


def options_for_level(level: CompressionLevel) -> CompressOptions:
    preset = _PRESETS.get(level)
    if preset is None:
        raise ValueError(f"No preset available for level={level.value}.")
    return preset


def options_from_payload(
    *,
    level: CompressionLevel,
    overrides: dict[str, Any] | None,
) -> CompressOptions:
    if level is CompressionLevel.CUSTOM:
        base = _PRESETS[CompressionLevel.MEDIUM]
    else:
        base = options_for_level(level)
    if not overrides:
        return base
    return _merge_options(base, overrides)


def _merge_options(base: CompressOptions, overrides: dict[str, Any]) -> CompressOptions:
    patch: dict[str, Any] = {}

    if "engine" in overrides and overrides["engine"] is not None:
        patch["engine"] = CompressionEngine(str(overrides["engine"]))

    if "pdf_version" in overrides:
        raw_version = overrides["pdf_version"]
        if raw_version is None:
            patch["pdf_version"] = None
        else:
            version_str = str(raw_version)
            if version_str not in _ALLOWED_PDF_VERSIONS:
                raise ValueError(f"Unsupported pdf_version: {version_str}")
            patch["pdf_version"] = version_str

    if "recompress_images" in overrides:
        patch["recompress_images"] = bool(overrides["recompress_images"])

    if "image_quality" in overrides and overrides["image_quality"] is not None:
        q = int(overrides["image_quality"])
        patch["image_quality"] = max(1, min(100, q))

    if "image_max_dimension" in overrides:
        raw = overrides["image_max_dimension"]
        if raw is None or raw == 0:
            patch["image_max_dimension"] = None
        else:
            d = int(raw)
            patch["image_max_dimension"] = max(64, min(8000, d))

    if "color_mode" in overrides and overrides["color_mode"] is not None:
        patch["color_mode"] = ColorMode(str(overrides["color_mode"]))

    if "recompress_streams" in overrides:
        patch["recompress_streams"] = bool(overrides["recompress_streams"])

    if "object_stream_mode" in overrides and overrides["object_stream_mode"] is not None:
        patch["object_stream_mode"] = ObjectStreamMode(str(overrides["object_stream_mode"]))

    for flag in (
        "strip_metadata",
        "discard_javascript",
        "discard_forms",
        "discard_annotations",
        "discard_bookmarks",
        "discard_attachments",
        "discard_thumbnails",
        "linearize",
    ):
        if flag in overrides:
            patch[flag] = bool(overrides[flag])

    return replace(base, **patch)


def _emit(progress: ProgressCallback, label: str) -> None:
    if progress is None:
        return
    with contextlib.suppress(Exception):
        progress(label)


def _safe_dimensions(image_obj: pikepdf.PdfImage) -> tuple[int, int] | None:
    try:
        width = int(image_obj.width)
        height = int(image_obj.height)
    except Exception:
        return None
    if width <= 0 or height <= 0:
        return None
    if width * height > _MAX_IMAGE_PIXELS:
        return None
    return width, height


def _load_pil(image_obj: pikepdf.PdfImage) -> Image.Image | None:
    try:
        return image_obj.as_pil_image()
    except (Image.DecompressionBombError, UnidentifiedImageError, ValueError, OSError):
        return None
    except Exception:
        return None


def _normalize_pil_mode(pil_img: Image.Image, color_mode: ColorMode) -> Image.Image | None:
    target = _PILLOW_MODE_FOR.get(color_mode)
    try:
        if target == "L":
            if pil_img.mode != "L":
                return pil_img.convert("L")
            return pil_img
        if pil_img.mode in ("RGB", "L", "CMYK"):
            return pil_img
        return pil_img.convert("RGB")
    except Exception:
        return None


def _maybe_resize(pil_img: Image.Image, max_dim: int | None) -> tuple[Image.Image, bool]:
    if max_dim is None:
        return pil_img, False
    longest = max(pil_img.size)
    if longest <= max_dim:
        return pil_img, False
    scale = max_dim / float(longest)
    new_size = (
        max(1, math.floor(pil_img.width * scale)),
        max(1, math.floor(pil_img.height * scale)),
    )
    try:
        resized = pil_img.resize(new_size, Image.Resampling.LANCZOS)
    except Exception:
        return pil_img, False
    return resized, True


def _encode_jpeg(pil_img: Image.Image, quality: int) -> bytes | None:
    buffer = io.BytesIO()
    try:
        pil_img.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=False)
    except Exception:
        return None
    return buffer.getvalue()


def _replace_image_stream(image_obj: pikepdf.PdfImage, new_bytes: bytes, gray: bool) -> bool:
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
        image_obj.obj.ColorSpace = pikepdf.Name.DeviceGray if gray else pikepdf.Name.DeviceRGB
        if pikepdf.Name.SMask in image_obj.obj:
            del image_obj.obj[pikepdf.Name.SMask]
    except Exception:
        return False
    return True


def _process_image(
    image_obj: pikepdf.PdfImage,
    *,
    options: CompressOptions,
) -> tuple[bool, bool]:
    dims = _safe_dimensions(image_obj)
    if dims is None:
        return False, False
    if dims[0] * dims[1] < _MIN_IMAGE_PIXELS_TO_TOUCH and options.image_max_dimension is None:
        return False, False

    pil_img = _load_pil(image_obj)
    if pil_img is None:
        return False, False

    normalized = _normalize_pil_mode(pil_img, options.color_mode)
    if normalized is None:
        return False, False

    resized, was_resized = _maybe_resize(normalized, options.image_max_dimension)
    encoded = _encode_jpeg(resized, options.image_quality)
    if encoded is None:
        return False, False

    is_gray = resized.mode == "L"
    wrote = _replace_image_stream(image_obj, encoded, gray=is_gray)
    return wrote, was_resized and wrote


def _strip_metadata(pdf: pikepdf.Pdf) -> bool:
    touched = False
    try:
        docinfo = pdf.docinfo
        if docinfo is not None and len(docinfo) > 0:
            keys = list(docinfo.keys())
            for k in keys:
                with contextlib.suppress(Exception):
                    del docinfo[k]
            touched = True
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta:
            keys = list(meta.keys())
            for k in keys:
                with contextlib.suppress(Exception):
                    del meta[k]
            touched = True
    except Exception:
        pass
    return touched


def _discard_root(pdf: pikepdf.Pdf, options: CompressOptions) -> None:
    root = pdf.Root

    if options.discard_javascript:
        with contextlib.suppress(Exception):
            names = root.get(pikepdf.Name.Names)
            if names is not None and pikepdf.Name.JavaScript in names:
                del names[pikepdf.Name.JavaScript]
        with contextlib.suppress(Exception):
            if pikepdf.Name.OpenAction in root:
                action = root[pikepdf.Name.OpenAction]
                if isinstance(action, pikepdf.Dictionary):
                    s = action.get(pikepdf.Name.S)
                    if s == pikepdf.Name.JavaScript:
                        del root[pikepdf.Name.OpenAction]

    if options.discard_forms:
        with contextlib.suppress(Exception):
            if pikepdf.Name.AcroForm in root:
                del root[pikepdf.Name.AcroForm]

    if options.discard_bookmarks:
        with contextlib.suppress(Exception):
            if pikepdf.Name.Outlines in root:
                del root[pikepdf.Name.Outlines]
        with contextlib.suppress(Exception):
            if pikepdf.Name.PageMode in root:
                del root[pikepdf.Name.PageMode]

    if options.discard_attachments:
        with contextlib.suppress(Exception):
            names = root.get(pikepdf.Name.Names)
            if names is not None and pikepdf.Name.EmbeddedFiles in names:
                del names[pikepdf.Name.EmbeddedFiles]


def _discard_per_page(pdf: pikepdf.Pdf, options: CompressOptions) -> None:
    if not (options.discard_annotations or options.discard_thumbnails):
        return
    for page in pdf.pages:
        if options.discard_annotations:
            with contextlib.suppress(Exception):
                if pikepdf.Name.Annots in page.obj:
                    del page.obj[pikepdf.Name.Annots]
        if options.discard_thumbnails:
            with contextlib.suppress(Exception):
                if pikepdf.Name.Thumb in page.obj:
                    del page.obj[pikepdf.Name.Thumb]


def _object_stream_arg(mode: ObjectStreamMode) -> Any:
    if mode is ObjectStreamMode.PRESERVE:
        return pikepdf.ObjectStreamMode.preserve
    if mode is ObjectStreamMode.DISABLE:
        return pikepdf.ObjectStreamMode.disable
    return pikepdf.ObjectStreamMode.generate


def _verify_output(path: Path) -> None:
    try:
        verifier = pikepdf.open(str(path))
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("Compressed output failed verification.") from exc
    try:
        _ = len(verifier.pages)
    finally:
        verifier.close()


def _options_applied_dict(options: CompressOptions) -> dict[str, Any]:
    return {
        "engine": options.engine.value,
        "image_quality": options.image_quality,
        "image_max_dimension": options.image_max_dimension,
        "color_mode": options.color_mode.value,
        "linearize": options.linearize,
        "recompress_streams": options.recompress_streams,
        "recompress_images": options.recompress_images,
        "object_stream_mode": options.object_stream_mode.value,
        "strip_metadata": options.strip_metadata,
        "discard_javascript": options.discard_javascript,
        "discard_forms": options.discard_forms,
        "discard_annotations": options.discard_annotations,
        "discard_bookmarks": options.discard_bookmarks,
        "discard_attachments": options.discard_attachments,
        "discard_thumbnails": options.discard_thumbnails,
        "pdf_version": options.pdf_version,
    }


def _structural_pikepdf_pass(
    *,
    input_path: Path,
    output_path: Path,
    options: CompressOptions,
    progress: ProgressCallback,
) -> tuple[int, int, int, int, bool]:
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

    images_processed = 0
    images_recompressed = 0
    images_downsampled = 0
    metadata_stripped = False

    try:
        page_count = len(pdf.pages)

        if options.recompress_images and options.engine is CompressionEngine.PIKEPDF:
            _emit(progress, "recompressing_images")
            for page in pdf.pages:
                try:
                    image_items = list(page.images.items())
                except Exception:
                    continue
                for _name, raw in image_items:
                    images_processed += 1
                    try:
                        image_obj = pikepdf.PdfImage(raw)
                    except Exception:
                        continue
                    try:
                        wrote, was_resized = _process_image(image_obj, options=options)
                    except Exception:
                        continue
                    if wrote:
                        images_recompressed += 1
                    if was_resized:
                        images_downsampled += 1

        _emit(progress, "applying_options")
        _discard_root(pdf, options)
        _discard_per_page(pdf, options)
        if options.strip_metadata:
            metadata_stripped = _strip_metadata(pdf)

        _emit(progress, "saving")
        linearize = bool(options.linearize) and options.engine is CompressionEngine.PIKEPDF
        save_kwargs: dict[str, Any] = {
            "linearize": linearize,
            "compress_streams": True,
            "recompress_flate": bool(options.recompress_streams),
            "object_stream_mode": _object_stream_arg(options.object_stream_mode),
        }

        try:
            pdf.save(str(output_path), **save_kwargs)
        except pikepdf.PdfError as exc:
            raise PdfMalformedError(
                "The PDF could not be re-encoded. It may be malformed.",
            ) from exc
    finally:
        with contextlib.suppress(Exception):
            pdf.close()

    return (
        page_count,
        images_processed,
        images_recompressed,
        images_downsampled,
        metadata_stripped,
    )


def _compress_pikepdf(
    *,
    input_path: Path,
    output_path: Path,
    options: CompressOptions,
    progress: ProgressCallback,
) -> CompressResult:
    input_size = input_path.stat().st_size
    page_count, processed, recompressed, downsampled, stripped = _structural_pikepdf_pass(
        input_path=input_path,
        output_path=output_path,
        options=options,
        progress=progress,
    )
    _verify_output(output_path)
    output_size = output_path.stat().st_size
    if output_size > input_size:
        try:
            output_path.write_bytes(input_path.read_bytes())
            output_size = output_path.stat().st_size
        except OSError:
            pass
    ratio = output_size / input_size if input_size > 0 else 0.0
    _emit(progress, "saved")
    return CompressResult(
        output_path=output_path,
        input_size_bytes=input_size,
        output_size_bytes=output_size,
        ratio=ratio,
        page_count=page_count,
        images_processed=processed,
        images_recompressed=recompressed,
        images_downsampled=downsampled,
        metadata_stripped=stripped,
        engine=CompressionEngine.PIKEPDF,
        gs_version=None,
        options_applied=_options_applied_dict(options),
    )


def _compress_ghostscript(
    *,
    input_path: Path,
    output_path: Path,
    options: CompressOptions,
    progress: ProgressCallback,
) -> CompressResult:
    from papyrus_api.services.pdf.compress_gs import GsCompressInputs, gs_compress

    input_size = input_path.stat().st_size

    intermediate = output_path.with_suffix(output_path.suffix + ".pre")
    needs_structural_pass = (
        options.discard_javascript
        or options.discard_forms
        or options.discard_annotations
        or options.discard_bookmarks
        or options.discard_attachments
        or options.discard_thumbnails
        or options.strip_metadata
    )

    gs_input = input_path
    page_count = 0
    metadata_stripped = False

    if needs_structural_pass:
        page_count, _, _, _, metadata_stripped = _structural_pikepdf_pass(
            input_path=input_path,
            output_path=intermediate,
            options=options,
            progress=progress,
        )
        gs_input = intermediate

    _emit(progress, "ghostscript")
    try:
        gs_result = gs_compress(
            GsCompressInputs(
                input_path=gs_input,
                output_path=output_path,
                image_quality=options.image_quality,
                image_max_dimension=options.image_max_dimension,
                color_mode=options.color_mode.value,
                linearize=bool(options.linearize),
                pdf_version=options.pdf_version,
            )
        )
    finally:
        if needs_structural_pass:
            with contextlib.suppress(OSError):
                intermediate.unlink(missing_ok=True)

    _verify_output(output_path)
    output_size = output_path.stat().st_size
    if output_size > input_size:
        try:
            output_path.write_bytes(input_path.read_bytes())
            output_size = output_path.stat().st_size
        except OSError:
            pass

    if page_count == 0:
        try:
            verifier = pikepdf.open(str(output_path))
            try:
                page_count = len(verifier.pages)
            finally:
                verifier.close()
        except Exception:
            page_count = 0

    ratio = output_size / input_size if input_size > 0 else 0.0
    _emit(progress, "saved")
    return CompressResult(
        output_path=output_path,
        input_size_bytes=input_size,
        output_size_bytes=output_size,
        ratio=ratio,
        page_count=page_count,
        images_processed=0,
        images_recompressed=0,
        images_downsampled=0,
        metadata_stripped=metadata_stripped,
        engine=CompressionEngine.GHOSTSCRIPT,
        gs_version=gs_result.gs_version,
        options_applied=_options_applied_dict(options),
    )


def compress_pdf(
    *,
    input_path: Path,
    output_path: Path,
    level: CompressionLevel,
    options: CompressOptions | None = None,
    progress: ProgressCallback = None,
) -> CompressResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if options is None:
        options = options_for_level(level)

    if options.engine is CompressionEngine.GHOSTSCRIPT:
        return _compress_ghostscript(
            input_path=input_path,
            output_path=output_path,
            options=options,
            progress=progress,
        )
    return _compress_pikepdf(
        input_path=input_path,
        output_path=output_path,
        options=options,
        progress=progress,
    )


__all__ = [
    "ColorMode",
    "CompressOptions",
    "CompressResult",
    "CompressionEngine",
    "CompressionLevel",
    "ObjectStreamMode",
    "compress_pdf",
    "options_for_level",
    "options_from_payload",
]
