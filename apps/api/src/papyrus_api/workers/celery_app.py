from __future__ import annotations

from celery import Celery
from celery.signals import worker_process_init
from papyrus_api.core.config import settings
from papyrus_api.core.logging import configure_logging

celery_app = Celery(
    "papyrus",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "papyrus_api.workers.runtime",
        "papyrus_api.workers.tasks.cleanup",
        "papyrus_api.workers.tasks.pdf_pipeline",
        "papyrus_api.workers.tasks.pdf_tools",
    ],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=15 * 60,
    task_soft_time_limit=14 * 60,
    worker_max_tasks_per_child=200,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    result_expires=settings.job_result_ttl_seconds,
    timezone="UTC",
    enable_utc=True,
    task_default_queue="default",
    task_routes={
        "papyrus.pdf.*": {"queue": "pdf"},
        "papyrus.cleanup.*": {"queue": "cleanup"},
    },
)


@worker_process_init.connect
def _init_worker(**_: object) -> None:
    configure_logging()
