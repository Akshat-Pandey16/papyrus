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


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
