from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from papyrus_api.schemas.common import StrictModel

CompressionLevelLiteral = Literal["low", "medium", "high", "extreme", "custom"]
ColorModeLiteral = Literal["preserve", "grayscale"]
ObjectStreamModeLiteral = Literal["preserve", "generate", "disable"]
CompressionEngineLiteral = Literal["pikepdf", "ghostscript"]
PdfVersionLiteral = Literal["1.4", "1.5", "1.6", "1.7"]
JobStatusLiteral = Literal["pending", "running", "succeeded", "failed", "cancelled"]
JobKindLiteral = Literal[
    "merge",
    "split",
    "compress",
    "ocr",
    "convert",
    "redact",
    "rotate",
    "reorder",
    "sign",
    "metadata",
    "protect",
    "unlock",
    "watermark",
    "page_numbers",
    "crop",
    "pdf_to_images",
    "images_to_pdf",
    "edit",
]

OverlayFontLiteral = Literal[
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Oblique",
    "Helvetica-BoldOblique",
    "Times-Roman",
    "Times-Bold",
    "Times-Italic",
    "Courier",
    "Courier-Bold",
]
PageNumberPositionLiteral = Literal[
    "bottom-center",
    "bottom-right",
    "bottom-left",
    "top-center",
    "top-right",
    "top-left",
]
ImageFormatLiteral = Literal["jpeg", "png"]
PageSizeLiteral = Literal["auto", "a4", "letter"]
RgbColor = Annotated[list[float], Field(min_length=3, max_length=3)]


class _MutableModel(StrictModel):
    model_config = ConfigDict(strict=False, extra="forbid", frozen=False)


class CompressOptionsIn(_MutableModel):
    engine: CompressionEngineLiteral | None = None
    recompress_images: bool | None = None
    image_quality: int | None = Field(default=None, ge=1, le=100)
    image_max_dimension: int | None = Field(default=None, ge=0, le=8000)
    color_mode: ColorModeLiteral | None = None
    recompress_streams: bool | None = None
    object_stream_mode: ObjectStreamModeLiteral | None = None
    strip_metadata: bool | None = None
    discard_javascript: bool | None = None
    discard_forms: bool | None = None
    discard_annotations: bool | None = None
    discard_bookmarks: bool | None = None
    discard_attachments: bool | None = None
    discard_thumbnails: bool | None = None
    linearize: bool | None = None
    pdf_version: PdfVersionLiteral | None = None


class CompressJobRequest(_MutableModel):
    document_id: UUID
    compression_level: CompressionLevelLiteral
    options: CompressOptionsIn | None = None
    idempotency_key: UUID
    zero_retention: bool = False

    @model_validator(mode="after")
    def _require_options_for_custom(self) -> CompressJobRequest:
        if self.compression_level == "custom" and self.options is None:
            raise ValueError("Custom compression requires options.")
        return self


class CompressEstimateRequest(_MutableModel):
    document_id: UUID
    compression_level: CompressionLevelLiteral
    options: CompressOptionsIn | None = None

    @model_validator(mode="after")
    def _require_options_for_custom(self) -> CompressEstimateRequest:
        if self.compression_level == "custom" and self.options is None:
            raise ValueError("Custom compression requires options.")
        return self


class CompressEstimateOut(StrictModel):
    input_size_bytes: int
    projected_output_size_bytes: int
    projected_ratio: float
    projected_savings_bytes: int
    total_page_count: int
    sample_page_count: int
    sample_input_size_bytes: int
    sample_output_size_bytes: int
    engine: CompressionEngineLiteral
    gs_version: str | None
    elapsed_ms: int


class RetryJobRequest(_MutableModel):
    idempotency_key: UUID


SplitModeLiteral = Literal["ranges", "every_n", "single_pages"]


class PageRangeIn(_MutableModel):
    from_page: int = Field(alias="from", ge=1)
    to_page: int = Field(alias="to", ge=1)

    @model_validator(mode="after")
    def _ordered(self) -> PageRangeIn:
        if self.to_page < self.from_page:
            raise ValueError("Range 'to' must be greater than or equal to 'from'.")
        return self


class SplitOptionsIn(_MutableModel):
    combine_into_single: bool | None = None
    strip_metadata: bool | None = None
    linearize: bool | None = None
    pdf_version: PdfVersionLiteral | None = None
    compress: CompressOptionsIn | None = None


class SplitJobRequest(_MutableModel):
    document_id: UUID
    mode: SplitModeLiteral = "ranges"
    ranges: list[PageRangeIn] | None = None
    every_n: int | None = Field(default=None, ge=1, le=10_000)
    options: SplitOptionsIn | None = None
    idempotency_key: UUID
    zero_retention: bool = False

    @model_validator(mode="after")
    def _validate_mode(self) -> SplitJobRequest:
        if self.mode == "ranges":
            if not self.ranges:
                raise ValueError("Ranges mode requires at least one range.")
            if len(self.ranges) > 100:
                raise ValueError("At most 100 ranges per split.")
        elif self.mode == "every_n":
            if self.every_n is None:
                raise ValueError("Every-N mode requires every_n.")
        return self


class RotateJobRequest(_MutableModel):
    document_id: UUID
    rotations: dict[str, int]
    idempotency_key: UUID
    zero_retention: bool = False

    @field_validator("rotations")
    @classmethod
    def _validate_rotations(cls, value: dict[str, int]) -> dict[str, int]:
        if not value:
            raise ValueError("Provide at least one page rotation.")
        for k, v in value.items():
            try:
                int(k)
            except ValueError as exc:
                raise ValueError(f"Invalid page number '{k}'.") from exc
            if v not in {0, 90, 180, 270, -90, -180, -270}:
                raise ValueError(f"Invalid rotation '{v}' for page {k}.")
        return value


class ReorderJobRequest(_MutableModel):
    document_id: UUID
    order: list[int] = Field(min_length=1, max_length=10_000)
    idempotency_key: UUID
    zero_retention: bool = False

    @field_validator("order")
    @classmethod
    def _validate_order(cls, value: list[int]) -> list[int]:
        for p in value:
            if p < 1:
                raise ValueError("Page numbers must be 1-indexed.")
        return value


class OcrJobRequest(_MutableModel):
    document_id: UUID
    language: str = Field(default="eng", min_length=2, max_length=32)
    idempotency_key: UUID
    zero_retention: bool = False


class MergeInputSpec(_MutableModel):
    document_id: UUID
    page_ranges: str | None = Field(default=None, max_length=512)


class MergeOptionsIn(_MutableModel):
    add_filename_bookmarks: bool | None = None
    blank_pages_between: int | None = Field(default=None, ge=0, le=2)
    strip_metadata: bool | None = None
    linearize: bool | None = None
    pdf_version: PdfVersionLiteral | None = None
    compress: CompressOptionsIn | None = None


class MergeJobRequest(_MutableModel):
    inputs: list[MergeInputSpec] = Field(min_length=2, max_length=50)
    options: MergeOptionsIn | None = None
    idempotency_key: UUID
    zero_retention: bool = False

    @field_validator("inputs")
    @classmethod
    def _no_duplicate_documents(cls, value: list[MergeInputSpec]) -> list[MergeInputSpec]:
        ids = [item.document_id for item in value]
        if len(set(ids)) != len(ids):
            raise ValueError("inputs must not contain duplicate document_ids.")
        return value


class ProtectJobRequest(_MutableModel):
    document_id: UUID
    password: str = Field(min_length=1, max_length=256)
    owner_password: str | None = Field(default=None, max_length=256)
    allow_printing: bool = True
    allow_copying: bool = False
    idempotency_key: UUID
    zero_retention: bool = False


class UnlockJobRequest(_MutableModel):
    document_id: UUID
    password: str = Field(min_length=1, max_length=256)
    idempotency_key: UUID
    zero_retention: bool = False


class WatermarkJobRequest(_MutableModel):
    document_id: UUID
    text: str = Field(min_length=1, max_length=120)
    color: RgbColor | None = None
    opacity: float = Field(default=0.25, ge=0.05, le=1.0)
    size: float = Field(default=48.0, ge=6.0, le=200.0)
    rotation: float = Field(default=45.0, ge=-360.0, le=360.0)
    tile: bool = True
    font: OverlayFontLiteral = "Helvetica-Bold"
    idempotency_key: UUID
    zero_retention: bool = False


class PageNumbersJobRequest(_MutableModel):
    document_id: UUID
    format: str = Field(default="{n}", min_length=1, max_length=40)
    position: PageNumberPositionLiteral = "bottom-center"
    start_at: int = Field(default=1, ge=0, le=1_000_000)
    size: float = Field(default=11.0, ge=6.0, le=72.0)
    color: RgbColor | None = None
    font: OverlayFontLiteral = "Helvetica"
    idempotency_key: UUID
    zero_retention: bool = False


class CropBoxIn(_MutableModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)


class CropJobRequest(_MutableModel):
    document_id: UUID
    box: CropBoxIn
    pages: list[int] | None = Field(default=None, max_length=10_000)
    idempotency_key: UUID
    zero_retention: bool = False


class PdfToImagesJobRequest(_MutableModel):
    document_id: UUID
    image_format: ImageFormatLiteral = "jpeg"
    dpi: int = Field(default=150, ge=36, le=300)
    quality: int = Field(default=85, ge=30, le=100)
    idempotency_key: UUID
    zero_retention: bool = False


class ImagesToPdfJobRequest(_MutableModel):
    document_ids: list[UUID] = Field(min_length=1, max_length=200)
    page_size: PageSizeLiteral = "auto"
    idempotency_key: UUID
    zero_retention: bool = False

    @field_validator("document_ids")
    @classmethod
    def _no_duplicates(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("document_ids must not contain duplicates.")
        return value


class RedactJobRequest(_MutableModel):
    document_id: UUID
    redactions: list[dict[str, Any]] = Field(min_length=1, max_length=5_000)
    dpi: int = Field(default=200, ge=72, le=300)
    idempotency_key: UUID
    zero_retention: bool = False


class ImageRefIn(_MutableModel):
    ref: str = Field(min_length=1, max_length=64)
    document_id: UUID


class SignJobRequest(_MutableModel):
    document_id: UUID
    images: list[ImageRefIn] = Field(default_factory=list, max_length=50)
    placements: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    idempotency_key: UUID
    zero_retention: bool = False


class EditJobRequest(_MutableModel):
    document_id: UUID
    images: list[ImageRefIn] = Field(default_factory=list, max_length=50)
    ops: list[dict[str, Any]] = Field(min_length=1, max_length=2_000)
    idempotency_key: UUID
    zero_retention: bool = False


class JobOut(StrictModel):
    id: UUID
    kind: JobKindLiteral
    status: JobStatusLiteral
    phase: str | None
    progress: float | None
    params: dict[str, Any]
    document_id: UUID | None
    input_size_bytes: int | None
    output_size_bytes: int | None
    compression_ratio: float | None
    output_object_id: UUID | None
    error_code: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class DownloadUrlOut(StrictModel):
    url: str
    expires_at: datetime
    filename: str


class JobsListPage(StrictModel):
    items: list[JobOut]
    next_cursor: str | None


class JobsListQuery(_MutableModel):
    kind: JobKindLiteral | None = None
    status: JobStatusLiteral | None = None
    cursor: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
