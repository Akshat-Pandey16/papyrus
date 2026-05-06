from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl, BeforeValidator, Field, SecretStr
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class LogFormat(StrEnum):
    PRETTY = "pretty"
    JSON = "json"


class EmailProvider(StrEnum):
    SMTP = "smtp"
    SES = "ses"
    POSTMARK = "postmark"


def _split_csv(v: object) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        return [s.strip() for s in v.split(",") if s.strip()]
    raise TypeError(f"expected str or list, got {type(v).__name__}")


CsvList = Annotated[list[str], NoDecode, BeforeValidator(_split_csv)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    papyrus_env: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.PRETTY

    api_host: str = "0.0.0.0"  # noqa: S104
    api_port: int = 8000
    api_public_url: AnyHttpUrl = AnyHttpUrl("http://localhost:8000")
    api_cors_origins: CsvList = Field(default_factory=lambda: ["http://localhost:5173"])

    database_url: str = "postgresql+asyncpg://papyrus:papyrus@localhost:5432/papyrus"
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_pool_timeout: int = 30
    database_echo: bool = False

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key_id: SecretStr = SecretStr("papyrus")
    s3_secret_access_key: SecretStr = SecretStr("papyrus-secret")
    s3_bucket_uploads: str = "papyrus-uploads"
    s3_bucket_outputs: str = "papyrus-outputs"
    s3_presign_expires_seconds: int = 900
    s3_force_path_style: bool = True

    jwt_secret: SecretStr = SecretStr("change-me")
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 2_592_000
    argon2_time_cost: int = 3
    argon2_memory_cost: int = 65536
    argon2_parallelism: int = 4

    anon_max_file_bytes: int = 25 * 1024 * 1024
    user_max_file_bytes: int = 500 * 1024 * 1024
    anon_daily_job_quota: int = 10
    user_daily_job_quota: int = 200
    job_result_ttl_seconds: int = 86_400

    email_provider: EmailProvider = EmailProvider.SMTP
    email_from: str = "noreply@papyrus.local"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_tls: bool = False

    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str = "http://localhost:4318"
    otel_service_name: str = "papyrus-api"

    zero_retention_mode: bool = False

    @property
    def is_development(self) -> bool:
        return self.papyrus_env is Environment.DEVELOPMENT

    @property
    def is_production(self) -> bool:
        return self.papyrus_env is Environment.PRODUCTION

    @property
    def is_test(self) -> bool:
        return self.papyrus_env is Environment.TEST


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
