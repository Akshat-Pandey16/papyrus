from __future__ import annotations

import asyncio
import threading
from collections.abc import Coroutine
from typing import Any

import structlog
from celery.signals import worker_process_init, worker_process_shutdown

from papyrus_api.db.session import dispose_engine, init_engine
from papyrus_api.integrations.redis import close_redis, init_redis
from papyrus_api.services.storage_service import close_storage

log = structlog.get_logger(__name__)

_loop: asyncio.AbstractEventLoop | None = None
_loop_thread: threading.Thread | None = None
_loop_ready = threading.Event()


def _run_loop() -> None:
    global _loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _loop = loop
    _loop_ready.set()
    try:
        loop.run_forever()
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            loop.run_until_complete(loop.shutdown_asyncgens())
        finally:
            loop.close()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop_thread
    loop = _loop
    if loop is not None:
        return loop
    if _loop_thread is None:
        _loop_thread = threading.Thread(
            target=_run_loop,
            name="papyrus-worker-loop",
            daemon=True,
        )
        _loop_thread.start()
    _loop_ready.wait()
    loop = _loop
    if loop is None:
        raise RuntimeError("worker loop failed to start")
    return loop


def run_async[T](coro: Coroutine[Any, Any, T]) -> T:
    loop = _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()


@worker_process_init.connect
def _init_worker_runtime(**_: object) -> None:
    init_engine()
    init_redis()
    _ensure_loop()
    log.info("worker.runtime.ready")


@worker_process_shutdown.connect
def _shutdown_worker_runtime(**_: object) -> None:
    global _loop, _loop_thread

    async def _close() -> None:
        try:
            await close_storage()
        except Exception:
            log.warning("worker.close_storage_failed")
        try:
            await close_redis()
        except Exception:
            log.warning("worker.close_redis_failed")
        try:
            await dispose_engine()
        except Exception:
            log.warning("worker.dispose_engine_failed")

    if _loop is not None:
        try:
            run_async(_close())
        except Exception:
            log.warning("worker.runtime.close_failed")
        _loop.call_soon_threadsafe(_loop.stop)
    if _loop_thread is not None and _loop_thread.is_alive():
        _loop_thread.join(timeout=5)
    _loop = None
    _loop_thread = None
