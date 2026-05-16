from __future__ import annotations

import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

import anyio
import pikepdf
import structlog
from papyrus_api.core.config import settings
from papyrus_api.core.errors import (
    DocumentNotFoundError,
    PdfEncryptedError,
    PdfMalformedError,
    QuotaExceededError,
    ValidationError,
)
from papyrus_api.repositories.documents import (
    DocumentVersionRepository,
    StorageObjectRepository,
)
from papyrus_api.services.pdf.compress import (
    CompressionEngine,
    CompressionLevel,
    compress_pdf,
    options_from_payload,
)
from papyrus_api.services.pdf.gs_runtime import GsNotConfiguredError, is_available
from papyrus_api.services.storage_service import StorageService
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)

_SAMPLE_PAGE_LIMIT = 3
_ESTIMATE_MAX_INPUT_BYTES = 100 * 1024 * 1024


@dataclass(slots=True, frozen=True)
class EstimateResult:
    input_size_bytes: int
    projected_output_size_bytes: int
    projected_ratio: float
    projected_savings_bytes: int
    total_page_count: int
    sample_page_count: int
    sample_input_size_bytes: int
    sample_output_size_bytes: int
    engine: str
    gs_version: str | None
    elapsed_ms: int


class CompressEstimateService:
    def __init__(self, session: AsyncSession, storage: StorageService) -> None:
        self.session = session
        self.storage = storage
        self.versions = DocumentVersionRepository(session)
        self.storage_objects = StorageObjectRepository(session)

    async def estimate(
        self,
        *,
        organization_id: UUID,
        document_id: UUID,
        compression_level: str,
        options: dict[str, Any] | None,
        is_anonymous: bool = False,
    ) -> EstimateResult:
        try:
            level = CompressionLevel(compression_level)
        except ValueError as exc:
            raise ValidationError(
                "Unsupported compression_level.",
                details={"compression_level": compression_level},
            ) from exc

        triple = await self.versions.get_with_storage(
            organization_id=organization_id,
            document_id=document_id,
        )
        if triple is None:
            raise DocumentNotFoundError("Document not found.")
        _document, _version, storage_object = triple

        max_bytes = settings.anon_max_file_bytes if is_anonymous else settings.user_max_file_bytes
        if storage_object.size_bytes > max_bytes:
            raise QuotaExceededError(
                "File exceeds the maximum allowed size.",
                details={"max_bytes": max_bytes, "anonymous": is_anonymous},
            )
        if storage_object.size_bytes > _ESTIMATE_MAX_INPUT_BYTES:
            raise ValidationError(
                "Estimate is not available for files this large. Run the compression instead.",
                details={"max_bytes": _ESTIMATE_MAX_INPUT_BYTES},
            )

        compress_options = options_from_payload(level=level, overrides=options or {})
        if compress_options.engine is CompressionEngine.GHOSTSCRIPT and not is_available():
            raise GsNotConfiguredError(
                "Ghostscript is not available on this server.",
                details={"hint": "Pick the pikepdf engine."},
            )

        start = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="papyrus-estimate-") as tmp_root:
            tmp_dir = Path(tmp_root)
            input_path = tmp_dir / "input.pdf"
            sample_path = tmp_dir / "sample.pdf"
            output_path = tmp_dir / "sample.compressed.pdf"

            await self.storage.download_to_path(
                bucket=storage_object.bucket,
                key=storage_object.key,
                dest=input_path,
            )

            total_pages, sample_pages, sample_input_size = await anyio.to_thread.run_sync(
                _build_sample,
                input_path,
                sample_path,
            )

            result = await anyio.to_thread.run_sync(
                _run_sample_compression,
                sample_path,
                output_path,
                level,
                compress_options,
            )

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        sample_in = max(1, sample_input_size)
        sample_ratio = result.output_size_bytes / sample_in if sample_in > 0 else 1.0
        projected = int(storage_object.size_bytes * sample_ratio)
        projected = min(projected, storage_object.size_bytes)
        savings = max(0, storage_object.size_bytes - projected)
        ratio = projected / storage_object.size_bytes if storage_object.size_bytes > 0 else 0.0

        log.info(
            "jobs.compress.estimate",
            document_id=str(document_id),
            level=level.value,
            engine=compress_options.engine.value,
            total_pages=total_pages,
            sample_pages=sample_pages,
            input_size=storage_object.size_bytes,
            projected=projected,
            elapsed_ms=elapsed_ms,
        )

        return EstimateResult(
            input_size_bytes=storage_object.size_bytes,
            projected_output_size_bytes=projected,
            projected_ratio=ratio,
            projected_savings_bytes=savings,
            total_page_count=total_pages,
            sample_page_count=sample_pages,
            sample_input_size_bytes=sample_input_size,
            sample_output_size_bytes=result.output_size_bytes,
            engine=result.engine.value,
            gs_version=result.gs_version,
            elapsed_ms=elapsed_ms,
        )


def _build_sample(input_path: Path, sample_path: Path) -> tuple[int, int, int]:
    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError(
            "This PDF is password-protected. Remove the password and try again.",
        ) from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError(
            "This PDF appears to be malformed and cannot be processed.",
        ) from exc

    try:
        total_pages = len(src.pages)
        sample_pages = min(_SAMPLE_PAGE_LIMIT, total_pages)
        if sample_pages == 0:
            raise PdfMalformedError("PDF has no pages.")
        sample = pikepdf.Pdf.new()
        try:
            for idx in range(sample_pages):
                sample.pages.append(src.pages[idx])
            sample.save(str(sample_path))
        finally:
            sample.close()
    finally:
        src.close()
    return total_pages, sample_pages, sample_path.stat().st_size


def _run_sample_compression(
    sample_path: Path,
    output_path: Path,
    level: CompressionLevel,
    options: Any,
) -> Any:
    return compress_pdf(
        input_path=sample_path,
        output_path=output_path,
        level=level,
        options=options,
    )
