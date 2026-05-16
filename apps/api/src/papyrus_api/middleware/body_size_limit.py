from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: Any,
        *,
        max_bytes: int,
        bypass_prefixes: Iterable[str] = (),
    ) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes
        self.bypass_prefixes = tuple(bypass_prefixes)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in self.bypass_prefixes):
            return await call_next(request)

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
            except ValueError:
                size = -1
            if size > self.max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "payload_too_large",
                            "message": "Request body is too large.",
                            "details": {"max_bytes": self.max_bytes},
                            "request_id": getattr(request.state, "request_id", None),
                        },
                    },
                )
        return await call_next(request)
