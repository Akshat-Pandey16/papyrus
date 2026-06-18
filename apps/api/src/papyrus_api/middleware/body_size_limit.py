from __future__ import annotations

import json
from collections.abc import Iterable

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class _ContentTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int,
        bypass_prefixes: Iterable[str] = (),
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.bypass_prefixes = tuple(bypass_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if any(path.startswith(p) for p in self.bypass_prefixes):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                if int(declared) > self.max_bytes:
                    await self._reject(scope, send)
                    return
            except ValueError:
                pass

        total = 0

        async def guarded_receive() -> Message:
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b"") or b"")
                if total > self.max_bytes:
                    raise _ContentTooLargeError
            return message

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, guarded_receive, tracking_send)
        except _ContentTooLargeError:
            if response_started:
                raise
            await self._reject(scope, send)

    async def _reject(self, scope: Scope, send: Send) -> None:
        request_id: str | None = None
        for key, value in scope.get("headers") or []:
            if key == b"x-request-id":
                request_id = value.decode("latin-1")
                break
        body = json.dumps(
            {
                "error": {
                    "code": "payload_too_large",
                    "message": "Request body is too large.",
                    "details": {"max_bytes": self.max_bytes},
                    "request_id": request_id,
                },
            }
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
