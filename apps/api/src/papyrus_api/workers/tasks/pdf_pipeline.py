from __future__ import annotations

from uuid import UUID

import structlog

from papyrus_api.workers.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(name="papyrus.pdf.run", bind=False, max_retries=3)
def run_pdf_job(job_id: str) -> str:
    parsed = UUID(job_id)
    log.info("pdf.job.start", job_id=str(parsed))
    return str(parsed)
