from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)


class HealthResponse(StrictModel):
    status: str
    version: str


class ReadinessResponse(StrictModel):
    status: str
    version: str
    checks: dict[str, str]


class ErrorBody(StrictModel):
    code: str
    message: str
    details: dict[str, Any]
    request_id: str | None


class ErrorResponse(StrictModel):
    error: ErrorBody
