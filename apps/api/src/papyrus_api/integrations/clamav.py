from __future__ import annotations

import socket
from pathlib import Path

import anyio
import structlog

from papyrus_api.core.config import settings
from papyrus_api.core.errors import MaliciousFileError

log = structlog.get_logger(__name__)

_CHUNK = 64 * 1024


def _scan_blocking(path: Path) -> str | None:
    try:
        with socket.create_connection(
            (settings.clamav_host, settings.clamav_port),
            timeout=settings.clamav_timeout_seconds,
        ) as sock:
            sock.settimeout(settings.clamav_timeout_seconds)
            sock.sendall(b"zINSTREAM\0")
            sent = 0
            with path.open("rb") as fh:
                while True:
                    chunk = fh.read(_CHUNK)
                    if not chunk:
                        break
                    sent += len(chunk)
                    if sent > settings.clamav_max_scan_bytes:
                        break
                    sock.sendall(len(chunk).to_bytes(4, "big") + chunk)
            sock.sendall((0).to_bytes(4, "big"))
            response = sock.recv(4096)
    except OSError as exc:
        log.warning("clamav.unavailable", error=str(exc))
        return None
    return response.decode("latin-1", "replace").strip()


async def scan_input(path: Path) -> None:
    if not settings.clamav_enabled:
        return
    result = await anyio.to_thread.run_sync(_scan_blocking, path)
    if result is None:
        return
    if "FOUND" in result:
        signature = result.split(":", 1)[1].strip() if ":" in result else "unknown"
        log.warning("clamav.infected", signature=signature)
        raise MaliciousFileError(
            "This file was rejected by the malware scanner.",
            details={"signature": signature[:120]},
        )
