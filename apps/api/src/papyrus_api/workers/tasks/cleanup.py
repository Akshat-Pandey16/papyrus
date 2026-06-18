from __future__ import annotations

from datetime import timedelta
from uuid import UUID

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from papyrus_api.core.config import settings
from papyrus_api.core.time import utc_now
from papyrus_api.db.session import get_sessionmaker
from papyrus_api.domain.documents.models import Document, DocumentVersion, StorageObject
from papyrus_api.domain.identity.models import Organization, User
from papyrus_api.domain.jobs.enums import JobStatus
from papyrus_api.domain.jobs.models import Job
from papyrus_api.integrations.redis import get_redis
from papyrus_api.repositories.documents import (
    DocumentRepository,
    StorageObjectRepository,
)
from papyrus_api.repositories.jobs import JobEventRepository, JobRepository
from papyrus_api.repositories.users import (
    PasswordResetTokenRepository,
    RefreshTokenRepository,
)
from papyrus_api.services.storage_service import StorageService
from papyrus_api.workers.celery_app import celery_app
from papyrus_api.workers.runtime import run_async
from papyrus_api.workers.tasks._common import publish

log = structlog.get_logger(__name__)


async def _purge_objects(storage: StorageService, rows: list[StorageObject]) -> int:
    purged = 0
    for row in rows:
        try:
            await storage.delete(bucket=row.bucket, key=row.key)
            purged += 1
        except Exception as exc:
            log.warning(
                "cleanup.storage_purge_failed",
                storage_object_id=str(row.id),
                bucket=row.bucket,
                error=str(exc),
            )
    return purged


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
            .limit(500)
        )
        rows = list((await session.execute(stmt)).scalars().all())
        deleted = await _purge_objects(storage, rows)
        ids = [row.id for row in rows]
        if ids:
            await session.execute(delete(StorageObject).where(StorageObject.id.in_(ids)))
        await session.commit()

    log.info("cleanup.outputs.run", deleted=deleted)
    return deleted


async def _purge_expired_inputs() -> int:
    sessionmaker = get_sessionmaker()
    storage = StorageService()
    cutoff = utc_now() - timedelta(seconds=settings.input_retention_ttl_seconds)
    deleted = 0
    async with sessionmaker() as session:
        stmt = (
            select(StorageObject)
            .where(
                StorageObject.purpose == "upload",
                StorageObject.confirmed_at.is_not(None),
                StorageObject.created_at < cutoff,
            )
            .limit(500)
        )
        rows = list((await session.execute(stmt)).scalars().all())
        deleted = await _purge_objects(storage, rows)
        ids = [row.id for row in rows]
        doc_ids = [row.document_id for row in rows if row.document_id is not None]
        if ids:
            await session.execute(
                delete(DocumentVersion).where(DocumentVersion.storage_object_id.in_(ids))
            )
            await session.execute(delete(StorageObject).where(StorageObject.id.in_(ids)))
        if doc_ids:
            await session.execute(delete(Document).where(Document.id.in_(doc_ids)))
        await session.commit()

    log.info("cleanup.inputs.run", deleted=deleted)
    return deleted


async def _org_storage_objects(
    session: AsyncSession,
    organization_id: UUID,
) -> list[StorageObject]:
    upload_stmt = (
        select(StorageObject)
        .join(Document, StorageObject.document_id == Document.id)
        .where(Document.organization_id == organization_id)
    )
    output_stmt = (
        select(StorageObject)
        .join(Job, Job.output_object_id == StorageObject.id)
        .where(Job.organization_id == organization_id)
    )
    found: dict[UUID, StorageObject] = {}
    for stmt in (upload_stmt, output_stmt):
        for obj in (await session.execute(stmt)).scalars().all():
            found[obj.id] = obj
    return list(found.values())


async def _purge_anonymous_accounts() -> int:
    sessionmaker = get_sessionmaker()
    storage = StorageService()
    cutoff = utc_now() - timedelta(hours=24)
    purged = 0
    purged_objects = 0
    async with sessionmaker() as session:
        org_stmt = (
            select(Organization)
            .where(Organization.is_anonymous.is_(True), Organization.created_at < cutoff)
            .limit(200)
        )
        orgs = list((await session.execute(org_stmt)).scalars().all())
        for org in orgs:
            objects = await _org_storage_objects(session, org.id)
            purged_objects += await _purge_objects(storage, objects)
            await session.delete(org)
            purged += 1
        user_stmt = (
            select(User).where(User.is_anonymous.is_(True), User.created_at < cutoff).limit(200)
        )
        users = list((await session.execute(user_stmt)).scalars().all())
        for user in users:
            await session.delete(user)
        await session.commit()
    log.info("cleanup.anonymous.run", purged=purged, storage_objects_purged=purged_objects)
    return purged


async def _purge_auth_tokens() -> int:
    sessionmaker = get_sessionmaker()
    now = utc_now()
    deleted = 0
    async with sessionmaker() as session:
        refresh_repo = RefreshTokenRepository(session)
        reset_repo = PasswordResetTokenRepository(session)
        deleted += await refresh_repo.purge_dead_families(cutoff=now)
        deleted += await reset_repo.purge_consumed(cutoff=now)
        await session.commit()
    log.info("cleanup.auth_tokens.run", deleted=deleted)
    return deleted


async def _reap_stale_pending() -> int:
    sessionmaker = get_sessionmaker()
    redis = get_redis()
    cutoff = utc_now() - timedelta(seconds=settings.pending_job_timeout_seconds)
    failed = 0
    payload = {
        "phase": "failed",
        "error_code": "enqueue_lost",
        "error_message": "The job was never picked up. Please try again.",
    }
    async with sessionmaker() as session:
        repo = JobRepository(session)
        events = JobEventRepository(session)
        stale = await repo.list_stale_pending(cutoff=cutoff)
        reaped: list[UUID] = []
        for job in stale:
            marked = await repo.mark_failed(
                job_id=job.id,
                error_code="enqueue_lost",
                error_message="The job was never picked up.",
            )
            if marked is None:
                continue
            await events.append(job_id=job.id, status=JobStatus.FAILED, payload=payload)
            reaped.append(job.id)
            failed += 1
        await session.commit()
    for job_id in reaped:
        await publish(redis, job_id, JobStatus.FAILED, payload)
    log.info("cleanup.stale_pending.run", failed=failed)
    return failed


async def _purge_job_output(job_id: UUID) -> bool:
    sessionmaker = get_sessionmaker()
    storage = StorageService()
    async with sessionmaker() as session:
        job = await session.get(Job, job_id)
        if job is None or job.output_object_id is None:
            return False
        obj = await session.get(StorageObject, job.output_object_id)
        job.output_object_id = None
        if obj is not None:
            try:
                await storage.delete(bucket=obj.bucket, key=obj.key)
            except Exception as exc:
                log.warning(
                    "cleanup.zero_retention.output_purge_failed",
                    job_id=str(job_id),
                    error=str(exc),
                )
            await session.delete(obj)
        await session.commit()
    log.info("cleanup.zero_retention.output_purged", job_id=str(job_id))
    return True


@celery_app.task(name="papyrus.cleanup.purge_expired")
def purge_expired() -> int:
    log.info("cleanup.purge_expired.start")
    return run_async(_purge_expired_outputs())


@celery_app.task(name="papyrus.cleanup.purge_expired_inputs")
def purge_expired_inputs() -> int:
    log.info("cleanup.purge_expired_inputs.start")
    return run_async(_purge_expired_inputs())


@celery_app.task(name="papyrus.cleanup.orphaned_uploads")
def cleanup_orphaned_uploads() -> int:
    log.info("cleanup.orphaned_uploads.start")
    return run_async(_cleanup_orphans())


@celery_app.task(name="papyrus.cleanup.purge_anonymous")
def purge_anonymous_accounts() -> int:
    log.info("cleanup.purge_anonymous.start")
    return run_async(_purge_anonymous_accounts())


@celery_app.task(name="papyrus.cleanup.purge_auth_tokens")
def purge_auth_tokens() -> int:
    log.info("cleanup.purge_auth_tokens.start")
    return run_async(_purge_auth_tokens())


@celery_app.task(name="papyrus.cleanup.reap_stale_pending")
def reap_stale_pending() -> int:
    log.info("cleanup.reap_stale_pending.start")
    return run_async(_reap_stale_pending())


@celery_app.task(name="papyrus.cleanup.purge_job_output")
def purge_job_output(job_id: str) -> bool:
    return run_async(_purge_job_output(UUID(job_id)))
