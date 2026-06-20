from __future__ import annotations

from enum import StrEnum


class JobKind(StrEnum):
    MERGE = "merge"
    SPLIT = "split"
    COMPRESS = "compress"
    OCR = "ocr"
    CONVERT = "convert"
    REDACT = "redact"
    ROTATE = "rotate"
    REORDER = "reorder"
    SIGN = "sign"
    METADATA = "metadata"
    PROTECT = "protect"
    UNLOCK = "unlock"
    WATERMARK = "watermark"
    PAGE_NUMBERS = "page_numbers"
    CROP = "crop"
    PDF_TO_IMAGES = "pdf_to_images"
    IMAGES_TO_PDF = "images_to_pdf"
    EDIT = "edit"


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
