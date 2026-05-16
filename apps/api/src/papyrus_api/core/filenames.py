from __future__ import annotations

import re
import unicodedata

_WINDOWS_RESERVED_DEVICE_NAMES = frozenset(
    {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM0",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT0",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    }
)

_UNSAFE_CHARS_RE = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')
_WHITESPACE_RUN_RE = re.compile(r"\s+")
_TRAILING_NOISE = " ._-"

DEFAULT_MAX_STEM_LENGTH = 180


def safe_filename_stem(
    raw: object,
    *,
    fallback: str = "output",
    max_length: int = DEFAULT_MAX_STEM_LENGTH,
) -> str:
    if not isinstance(raw, str):
        return fallback
    s = unicodedata.normalize("NFC", raw).strip()
    if s.lower().endswith(".pdf"):
        s = s[:-4]
    s = _UNSAFE_CHARS_RE.sub("", s)
    s = _WHITESPACE_RUN_RE.sub(" ", s).strip(_TRAILING_NOISE)
    if not s:
        return fallback
    if s.upper() in _WINDOWS_RESERVED_DEVICE_NAMES:
        s = f"_{s}"
    if len(s) > max_length:
        s = s[:max_length].rstrip(_TRAILING_NOISE) or fallback
    return s


def compose_output_filename(
    *,
    stem: str | None,
    suffix: str,
    extension: str,
    fallback_stem: str = "output",
) -> str:
    cleaned = safe_filename_stem(stem, fallback=fallback_stem) if stem else fallback_stem
    suffix_part = f"-{suffix}" if suffix else ""
    return f"{cleaned}{suffix_part}.{extension}"


__all__ = ["compose_output_filename", "safe_filename_stem"]
