from __future__ import annotations

import contextlib
import os
import signal
import subprocess
from dataclasses import dataclass


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


def run_capture(cmd: list[str], *, timeout: int) -> CompletedCapture:
    with subprocess.Popen(  # noqa: S603
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    ) as proc:
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
