from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import aioboto3
from botocore.config import Config

from papyrus_api.core.config import settings
from papyrus_api.core.time import utc_now


@dataclass(slots=True, frozen=True)
class PresignedUpload:
    url: str
    fields: dict[str, str]
    bucket: str
    key: str
    expires_at: datetime


@dataclass(slots=True, frozen=True)
class HeadResult:
    size_bytes: int
    content_type: str
    etag: str | None


_session = aioboto3.Session()


def _client_config() -> Config:
    return Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"},
        retries={"max_attempts": 3, "mode": "standard"},
    )


def _client_kwargs() -> dict[str, Any]:
    return {
        "service_name": "s3",
        "endpoint_url": settings.s3_endpoint_url,
        "region_name": settings.s3_region,
        "aws_access_key_id": settings.s3_access_key_id.get_secret_value(),
        "aws_secret_access_key": settings.s3_secret_access_key.get_secret_value(),
        "config": _client_config(),
    }


class StorageService:
    @staticmethod
    async def ensure_bucket(bucket: str) -> bool:
        async with _session.client(**_client_kwargs()) as client:
            try:
                await client.head_bucket(Bucket=bucket)
                return False
            except client.exceptions.ClientError as exc:
                code = exc.response.get("Error", {}).get("Code")
                if code not in {"404", "NoSuchBucket", "NotFound"}:
                    raise
            await client.create_bucket(Bucket=bucket)
        return True

    @staticmethod
    async def presign_upload(
        *,
        bucket: str,
        key: str,
        content_type: str,
        max_bytes: int,
    ) -> PresignedUpload:
        async with _session.client(**_client_kwargs()) as client:
            post = await client.generate_presigned_post(
                Bucket=bucket,
                Key=key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 1, max_bytes],
                ],
                ExpiresIn=settings.s3_presign_expires_seconds,
            )
        expires_at = utc_now() + timedelta(seconds=settings.s3_presign_expires_seconds)
        return PresignedUpload(
            url=post["url"],
            fields=post["fields"],
            bucket=bucket,
            key=key,
            expires_at=expires_at,
        )

    @staticmethod
    async def presign_download(*, bucket: str, key: str, filename: str | None = None) -> str:
        params: dict[str, Any] = {"Bucket": bucket, "Key": key}
        if filename:
            safe = filename.replace('"', "")
            params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
        async with _session.client(**_client_kwargs()) as client:
            return await client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=settings.s3_presign_expires_seconds,
            )

    @staticmethod
    async def delete(*, bucket: str, key: str) -> None:
        async with _session.client(**_client_kwargs()) as client:
            await client.delete_object(Bucket=bucket, Key=key)

    @staticmethod
    async def head_object(*, bucket: str, key: str) -> HeadResult | None:
        async with _session.client(**_client_kwargs()) as client:
            try:
                response = await client.head_object(Bucket=bucket, Key=key)
            except client.exceptions.ClientError as exc:
                code = exc.response.get("Error", {}).get("Code")
                if code in {"404", "NoSuchKey", "NotFound"}:
                    return None
                raise
        etag_raw = response.get("ETag")
        etag = etag_raw.strip('"') if isinstance(etag_raw, str) else None
        return HeadResult(
            size_bytes=int(response.get("ContentLength", 0)),
            content_type=str(response.get("ContentType", "application/octet-stream")),
            etag=etag,
        )

    @staticmethod
    async def read_range(*, bucket: str, key: str, start: int, end: int) -> bytes:
        async with _session.client(**_client_kwargs()) as client:
            response = await client.get_object(
                Bucket=bucket,
                Key=key,
                Range=f"bytes={start}-{end}",
            )
            body = response["Body"]
            try:
                data: bytes = await body.read()
            finally:
                close = getattr(body, "close", None)
                if callable(close):
                    result = close()
                    if hasattr(result, "__await__"):
                        await result
        return data

    @staticmethod
    async def download_to_path(*, bucket: str, key: str, dest: Path) -> int:
        async with _session.client(**_client_kwargs()) as client:
            response = await client.get_object(Bucket=bucket, Key=key)
            body = response["Body"]
            total = 0
            try:
                with dest.open("wb") as fh:
                    while True:
                        chunk: bytes = await body.read(1024 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
                        total += len(chunk)
            finally:
                close = getattr(body, "close", None)
                if callable(close):
                    result = close()
                    if hasattr(result, "__await__"):
                        await result
        return total

    @staticmethod
    async def upload_from_path(
        *,
        bucket: str,
        key: str,
        src: Path,
        content_type: str,
    ) -> int:
        async with _session.client(**_client_kwargs()) as client:
            with src.open("rb") as fh:
                await client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=fh,
                    ContentType=content_type,
                )
        return src.stat().st_size  # noqa: ASYNC240
