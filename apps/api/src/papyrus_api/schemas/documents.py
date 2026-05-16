from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from papyrus_api.schemas.common import StrictModel
from pydantic import ConfigDict, Field


class _MutableModel(StrictModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class UploadInitiateRequest(_MutableModel):
    name: str = Field(min_length=1, max_length=255)
    content_type: Literal["application/pdf"]
    size_bytes: int = Field(ge=1)


class PresignedUploadOut(StrictModel):
    url: str
    fields: dict[str, str]
    bucket: str
    key: str
    expires_at: datetime


class UploadInitiateResponse(StrictModel):
    document_id: UUID
    storage_object_id: UUID
    upload: PresignedUploadOut
    max_bytes: int


class ConfirmUploadRequest(_MutableModel):
    etag: str | None = None


class DocumentVersionOut(StrictModel):
    id: UUID
    version: int
    storage_object_id: UUID
    size_bytes: int
    sha256: str | None


class DocumentOut(StrictModel):
    id: UUID
    name: str
    mime_type: str
    page_count: int | None
    created_at: datetime
    current_version: DocumentVersionOut | None
