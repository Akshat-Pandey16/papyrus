from __future__ import annotations

from typing import Any

from celery.schedules import crontab

BEAT_SCHEDULE: dict[str, dict[str, Any]] = {
    "cleanup-expired-artifacts": {
        "task": "papyrus.cleanup.purge_expired",
        "schedule": crontab(minute="*/15"),
    },
    "cleanup-expired-inputs": {
        "task": "papyrus.cleanup.purge_expired_inputs",
        "schedule": crontab(minute="*/30"),
    },
    "cleanup-orphaned-uploads": {
        "task": "papyrus.cleanup.orphaned_uploads",
        "schedule": crontab(minute="*/30"),
    },
    "cleanup-anonymous-accounts": {
        "task": "papyrus.cleanup.purge_anonymous",
        "schedule": crontab(minute="0", hour="*"),
    },
    "cleanup-auth-tokens": {
        "task": "papyrus.cleanup.purge_auth_tokens",
        "schedule": crontab(minute="20", hour="*"),
    },
    "reap-stale-pending-jobs": {
        "task": "papyrus.cleanup.reap_stale_pending",
        "schedule": crontab(minute="*/5"),
    },
    "reap-stale-running-jobs": {
        "task": "papyrus.cleanup.reap_stale_running",
        "schedule": crontab(minute="*/5"),
    },
}
