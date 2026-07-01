from __future__ import annotations

import smtplib
from email.message import EmailMessage

import anyio
import structlog

from papyrus_api.core.config import EmailProvider, settings

log = structlog.get_logger(__name__)


def _send_smtp_blocking(msg: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password.get_secret_value())
        server.send_message(msg)


async def send_email(*, to: str, subject: str, text_body: str) -> bool:
    if settings.email_provider is not EmailProvider.SMTP:
        log.warning("email.provider_not_implemented", provider=settings.email_provider.value)
        return False
    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    try:
        await anyio.to_thread.run_sync(_send_smtp_blocking, msg)
    except Exception as exc:
        log.warning("email.send_failed", error=type(exc).__name__)
        return False
    log.info("email.sent", subject=subject)
    return True
