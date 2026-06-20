from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import (
    PdfMalformedError,
    PdfNotEncryptedError,
    PdfWrongPasswordError,
    ValidationError,
)


@dataclass(slots=True, frozen=True)
class SecurityResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    encrypted: bool


def _save_kwargs() -> dict[str, object]:
    return {
        "compress_streams": True,
        "object_stream_mode": pikepdf.ObjectStreamMode.generate,
    }


def protect_pdf(
    *,
    input_path: Path,
    output_path: Path,
    user_password: str,
    owner_password: str | None = None,
    allow_printing: bool = True,
    allow_copying: bool = False,
) -> SecurityResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    if not user_password:
        raise ValidationError("A password is required to protect the PDF.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    try:
        pdf = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfWrongPasswordError(
            "This PDF is already password-protected. Unlock it before adding a new password.",
        ) from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    try:
        page_count = len(pdf.pages)
        permissions = pikepdf.Permissions(
            extract=allow_copying,
            modify_annotation=False,
            modify_assembly=False,
            modify_form=False,
            modify_other=False,
            print_lowres=allow_printing,
            print_highres=allow_printing,
        )
        encryption = pikepdf.Encryption(
            owner=owner_password or user_password,
            user=user_password,
            R=6,
            allow=permissions,
            aes=True,
            metadata=True,
        )
        pdf.save(str(output_path), encryption=encryption, **_save_kwargs())
    finally:
        pdf.close()

    return SecurityResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        encrypted=True,
    )


def unlock_pdf(
    *,
    input_path: Path,
    output_path: Path,
    password: str,
) -> SecurityResult:
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_size = input_path.stat().st_size

    # Probe without a password first: opening an unencrypted PDF with a password
    # makes pikepdf emit a warning, so we only supply one when it is actually needed.
    try:
        probe: pikepdf.Pdf | None = pikepdf.open(str(input_path))
    except pikepdf.PasswordError:
        probe = None
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    if probe is not None:
        try:
            if not probe.is_encrypted:
                raise PdfNotEncryptedError("This PDF is not password-protected.")
            page_count = len(probe.pages)
            probe.save(str(output_path), **_save_kwargs())
        finally:
            probe.close()
        return SecurityResult(
            output_path=output_path,
            output_size_bytes=output_path.stat().st_size,
            input_size_bytes=input_size,
            page_count=page_count,
            encrypted=False,
        )

    try:
        pdf = pikepdf.open(str(input_path), password=password or "")
    except pikepdf.PasswordError as exc:
        raise PdfWrongPasswordError(
            "The password did not unlock this PDF. Check it and try again.",
        ) from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    try:
        page_count = len(pdf.pages)
        pdf.save(str(output_path), **_save_kwargs())
    finally:
        pdf.close()

    return SecurityResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_size,
        page_count=page_count,
        encrypted=False,
    )


__all__ = ["SecurityResult", "protect_pdf", "unlock_pdf"]
