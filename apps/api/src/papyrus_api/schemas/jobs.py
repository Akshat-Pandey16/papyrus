from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from papyrus_api.schemas.common import StrictModel

CompressionLevelLiteral = Literal["low", "medium", "high"]
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
]


class _MutableModel(StrictModel):
    model_config = ConfigDict(strict=False, extra="forbid", frozen=False)


class CompressJobRequest(_MutableModel):
    document_id: UUID
    compression_level: CompressionLevelLiteral
    idempotency_key: UUID


class MergeJobRequest(_MutableModel):
    document_ids: list[UUID] = Field(min_length=2, max_length=50)
    idempotency_key: UUID

    @field_validator("document_ids")
    @classmethod
    def _no_duplicates(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("document_ids must not contain duplicates.")
        return value


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
