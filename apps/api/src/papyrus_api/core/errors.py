from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = structlog.get_logger(__name__)


class AppError(Exception):
    code: str = "internal_error"
    http_status: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(AppError):
    code = "not_found"
    http_status = status.HTTP_404_NOT_FOUND


class ConflictError(AppError):
    code = "conflict"
    http_status = status.HTTP_409_CONFLICT


class ValidationError(AppError):
    code = "validation_error"
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY


class AuthenticationError(AppError):
    code = "unauthenticated"
    http_status = status.HTTP_401_UNAUTHORIZED


class PermissionError(AppError):
    code = "forbidden"
    http_status = status.HTTP_403_FORBIDDEN


class CsrfError(AppError):
    code = "csrf_failed"
    http_status = status.HTTP_403_FORBIDDEN


class QuotaExceededError(AppError):
    code = "quota_exceeded"
    http_status = status.HTTP_429_TOO_MANY_REQUESTS


class RateLimitedError(AppError):
    code = "rate_limited"
    http_status = status.HTTP_429_TOO_MANY_REQUESTS


class GoneError(AppError):
    code = "gone"
    http_status = status.HTTP_410_GONE


class UnsupportedMediaTypeError(AppError):
    code = "unsupported_media_type"
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE


class DocumentNotFoundError(NotFoundError):
    code = "document_not_found"


class JobNotFoundError(NotFoundError):
    code = "job_not_found"


class UploadNotFoundInStorageError(ValidationError):
    code = "upload_not_found_in_storage"


class PdfSignatureInvalidError(ValidationError):
    code = "pdf_signature_invalid"


class UploadAlreadyConfirmedError(ConflictError):
    code = "upload_already_confirmed"


class JobNotTerminalError(ConflictError):
    code = "job_not_terminal"


class JobOutputExpiredError(GoneError):
    code = "job_output_expired"


class PdfEncryptedError(AppError):
    code = "pdf_encrypted"
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY


class PdfMalformedError(AppError):
    code = "pdf_malformed"
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY


def _envelope(
    *,
    code: str,
    message: str,
    details: dict[str, Any],
    request_id: str | None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": request_id,
        },
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        log.warning(
            "app.error",
            code=exc.code,
            message=exc.message,
            http_status=exc.http_status,
            request_id=request_id,
        )
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(
                code=exc.code,
                message=exc.message,
                details=exc.details,
                request_id=request_id,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope(
                code="validation_error",
                message="Request payload failed validation.",
                details={"errors": jsonable_encoder(exc.errors())},
                request_id=request_id,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_exc(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                code="http_error",
                message=str(exc.detail) if exc.detail else "HTTP error.",
                details={},
                request_id=request_id,
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        log.exception("app.unhandled", request_id=request_id)
        del exc
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope(
                code="internal_error",
                message="An unexpected error occurred.",
                details={},
                request_id=request_id,
            ),
        )
