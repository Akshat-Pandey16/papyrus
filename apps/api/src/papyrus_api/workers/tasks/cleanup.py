from __future__ import annotations

from datetime import timedelta

import structlog
from papyrus_api.core.config import settings
from papyrus_api.core.time import utc_now
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.documents.models import StorageObject
from papyrus_api.domain.identity.models import Organization, User
from papyrus_api.repositories.documents import (
    DocumentRepository,
    StorageObjectRepository,
)
from papyrus_api.services.storage_service import StorageService
from papyrus_api.workers.celery_app import celery_app
from papyrus_api.workers.runtime import run_async
from sqlalchemy import select

log = structlog.get_logger(__name__)


async def _cleanup_orphans() -> int:
    sessionmaker = get_sessionmaker()
    storage = StorageService()
    cutoff = utc_now() - timedelta(hours=1)
    deleted = 0
    async with sessionmaker() as session:
        repo = StorageObjectRepository(session)
        doc_repo = DocumentRepository(session)
        rows = await repo.list_unconfirmed_older_than(cutoff=cutoff, limit=200)
        for row in rows:
            try:
                await storage.delete(bucket=row.bucket, key=row.key)
            except Exception:
                log.warning(
                    "cleanup.orphans.delete_failed",
                    storage_object_id=str(row.id),
                )
                continue
            await session.delete(row)
            deleted += 1
        await session.flush()

        doc_cutoff = utc_now() - timedelta(hours=2)
        orphan_docs = await doc_repo.list_orphans_older_than(cutoff=doc_cutoff, limit=200)
        for doc in orphan_docs:
            await session.delete(doc)
        await session.commit()

    log.info("cleanup.orphans.run", deleted_storage_objects=deleted)
    return deleted


async def _purge_expired_outputs() -> int:
    sessionmaker = get_sessionmaker()
    storage = StorageService()
    cutoff = utc_now() - timedelta(seconds=settings.job_result_ttl_seconds)
    deleted = 0
    async with sessionmaker() as session:
        stmt = (
            select(StorageObject)
            .where(
                StorageObject.purpose == "output",
                StorageObject.created_at < cutoff,
            )
            .limit(200)
        )
        result = await session.execute(stmt)
        rows = list(result.scalars().all())
        for row in rows:
            try:
                await storage.delete(bucket=row.bucket, key=row.key)
            except Exception:
                log.warning(
                    "cleanup.outputs.delete_failed",
                    storage_object_id=str(row.id),
                )
                continue
            await session.delete(row)
            deleted += 1
        await session.commit()

    log.info("cleanup.outputs.run", deleted=deleted)
    return deleted


async def _purge_anonymous_accounts() -> int:
    sessionmaker = get_sessionmaker()
    cutoff = utc_now() - timedelta(hours=24)
    purged = 0
    async with sessionmaker() as session:
        org_stmt = (
            select(Organization)
            .where(Organization.is_anonymous.is_(True), Organization.created_at < cutoff)
            .limit(200)
        )
        orgs = list((await session.execute(org_stmt)).scalars().all())
        for org in orgs:
            await session.delete(org)
            purged += 1
        user_stmt = (
            select(User).where(User.is_anonymous.is_(True), User.created_at < cutoff).limit(200)
        )
        users = list((await session.execute(user_stmt)).scalars().all())
        for user in users:
            await session.delete(user)
        await session.commit()
    log.info("cleanup.anonymous.run", purged=purged)
    return purged


@celery_app.task(name="papyrus.cleanup.purge_expired")
def purge_expired() -> int:
    log.info("cleanup.purge_expired.start")
    return run_async(_purge_expired_outputs())


@celery_app.task(name="papyrus.cleanup.orphaned_uploads")
def cleanup_orphaned_uploads() -> int:
    log.info("cleanup.orphaned_uploads.start")
    return run_async(_cleanup_orphans())


@celery_app.task(name="papyrus.cleanup.purge_anonymous")
def purge_anonymous_accounts() -> int:
    log.info("cleanup.purge_anonymous.start")
    return run_async(_purge_anonymous_accounts())
