from __future__ import annotations

import contextlib
import os
import signal
import subprocess
from collections.abc import Callable
from dataclasses import dataclass

from papyrus_api.core.config import settings


@dataclass(slots=True, frozen=True)
class CompletedCapture:
    returncode: int
    stdout: str
    stderr: str


def _kill_process_group(proc: subprocess.Popen[str]) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        with contextlib.suppress(Exception):
            proc.kill()


def _resource_limiter() -> Callable[[], None] | None:
    cpu_seconds = settings.subprocess_cpu_seconds
    mem_mb = settings.subprocess_memory_limit_mb
    if cpu_seconds <= 0 and mem_mb <= 0:
        return None
    try:
        import resource
    except ImportError:
        return None

    def _apply() -> None:
        os.setsid()
        if cpu_seconds > 0:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        if mem_mb > 0:
            limit = mem_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))

    return _apply


def run_capture(cmd: list[str], *, timeout: int) -> CompletedCapture:
    limiter = _resource_limiter()
    popen_kwargs: dict[str, object] = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
    }
    if limiter is None:
        popen_kwargs["start_new_session"] = True
    else:
        popen_kwargs["preexec_fn"] = limiter
    with subprocess.Popen(cmd, **popen_kwargs) as proc:  # type: ignore[call-overload]  # noqa: S603
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            _kill_process_group(proc)
            with contextlib.suppress(Exception):
                proc.communicate(timeout=5)
            raise
        return CompletedCapture(
            returncode=proc.returncode,
            stdout=stdout or "",
            stderr=stderr or "",
        )
