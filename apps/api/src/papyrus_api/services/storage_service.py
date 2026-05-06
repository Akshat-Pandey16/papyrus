from __future__ import annotations

from dataclasses import dataclass

import aioboto3
from botocore.config import Config
from papyrus_api.core.config import settings


@dataclass(slots=True, frozen=True)
class PresignedUpload:
    url: str
    fields: dict[str, str]
    bucket: str
    key: str


_session = aioboto3.Session()


def _client_config() -> Config:
    return Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"},
        retries={"max_attempts": 3, "mode": "standard"},
    )


class StorageService:
    @staticmethod
    async def presign_upload(
        *,
        bucket: str,
        key: str,
        content_type: str,
        max_bytes: int,
    ) -> PresignedUpload:
        async with _session.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
            config=_client_config(),
        ) as client:
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
        return PresignedUpload(
            url=post["url"],
            fields=post["fields"],
            bucket=bucket,
            key=key,
        )

    @staticmethod
    async def presign_download(*, bucket: str, key: str) -> str:
        async with _session.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
            config=_client_config(),
        ) as client:
            return await client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=settings.s3_presign_expires_seconds,
            )

    @staticmethod
    async def delete(*, bucket: str, key: str) -> None:
        async with _session.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
            config=_client_config(),
        ) as client:
            await client.delete_object(Bucket=bucket, Key=key)
