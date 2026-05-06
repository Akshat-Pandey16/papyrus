from __future__ import annotations

from celery.schedules import crontab
from papyrus_api.workers.celery_app import celery_app

celery_app.conf.beat_schedule = {
    "cleanup-expired-artifacts": {
        "task": "papyrus.cleanup.purge_expired",
        "schedule": crontab(minute="*/15"),
    },
}
