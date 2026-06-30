from __future__ import annotations

import socket
from pathlib import Path

import anyio
import structlog

from papyrus_api.core.config import settings
from papyrus_api.core.errors import MaliciousFileError, ToolNotConfiguredError

log = structlog.get_logger(__name__)

_CHUNK = 64 * 1024
_UNAVAILABLE = "__unavailable__"
_TOO_LARGE = "__too_large__"


def _scan_blocking(path: Path) -> str:
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    if size > settings.clamav_max_scan_bytes:
        return _TOO_LARGE
    try:
        with socket.create_connection(
            (settings.clamav_host, settings.clamav_port),
            timeout=settings.clamav_timeout_seconds,
        ) as sock:
            sock.settimeout(settings.clamav_timeout_seconds)
            sock.sendall(b"zINSTREAM\0")
            with path.open("rb") as fh:
                while True:
                    chunk = fh.read(_CHUNK)
                    if not chunk:
                        break
                    sock.sendall(len(chunk).to_bytes(4, "big") + chunk)
            sock.sendall((0).to_bytes(4, "big"))
            response = sock.recv(4096)
    except OSError as exc:
        log.warning("clamav.unavailable", error=str(exc))
        return _UNAVAILABLE
    return response.decode("latin-1", "replace").strip()


async def scan_input(path: Path) -> None:
    if not settings.clamav_enabled:
        return
    result = await anyio.to_thread.run_sync(_scan_blocking, path)
    if result == _TOO_LARGE:
        log.warning("clamav.too_large", max_bytes=settings.clamav_max_scan_bytes)
        raise ToolNotConfiguredError(
            "This file is too large for the malware scanner on this server.",
            details={"max_bytes": settings.clamav_max_scan_bytes},
        )
    if result == _UNAVAILABLE:
        if settings.clamav_fail_closed:
            raise ToolNotConfiguredError(
                "Malware scanning is temporarily unavailable. Please try again shortly.",
                details={"retryable": True},
            )
        return
    if "FOUND" in result:
        signature = result.split(":", 1)[1].strip() if ":" in result else "unknown"
        log.warning("clamav.infected", signature=signature)
        raise MaliciousFileError(
            "This file was rejected by the malware scanner.",
            details={"signature": signature[:120]},
        )
