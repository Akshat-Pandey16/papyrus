from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache

from papyrus_api.core.errors import AppError


class GsNotConfiguredError(AppError):
    code = "ghostscript_not_configured"
    http_status = 503


@dataclass(slots=True, frozen=True)
class GsCapabilities:
    binary: str
    version: str
    has_jbig2: bool


@lru_cache(maxsize=1)
def detect_gs() -> GsCapabilities | None:
    binary = shutil.which("gs")
    if binary is None:
        return None
    try:
        version_proc = subprocess.run(  # noqa: S603
            [binary, "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    if version_proc.returncode != 0:
        return None
    version = (version_proc.stdout or "").strip()
    if not version:
        return None
    try:
        devices_proc = subprocess.run(  # noqa: S603
            [binary, "-h"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        devices_blob = (devices_proc.stdout or "") + (devices_proc.stderr or "")
    except (subprocess.SubprocessError, OSError):
        devices_blob = ""
    return GsCapabilities(
        binary=binary,
        version=version,
        has_jbig2="jbig2" in devices_blob.lower(),
    )


def ensure_gs_runtime() -> GsCapabilities:
    caps = detect_gs()
    if caps is None:
        raise GsNotConfiguredError(
            "Ghostscript is not available on this server.",
            details={"hint": "Install ghostscript on the worker host."},
        )
    return caps


def is_available() -> bool:
    return detect_gs() is not None
