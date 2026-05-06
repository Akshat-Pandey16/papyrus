from __future__ import annotations

import structlog

from papyrus_api.workers.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(name="papyrus.cleanup.purge_expired")
def purge_expired() -> int:
    log.info("cleanup.purge_expired.start")
    return 0
