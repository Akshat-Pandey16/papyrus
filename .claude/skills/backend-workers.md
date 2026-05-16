---
name: backend-workers
description: Celery setup, the dedicated event-loop runtime, cleanup tasks, beat schedule.
---

# Backend: workers

## Celery app

`workers/celery_app.py` configures:

- Broker: Redis DB 1 (`celery_broker_url`).
- Backend: Redis DB 2 (`celery_result_backend`).
- `task_acks_late=True`, `task_reject_on_worker_lost=True`.
- `worker_prefetch_multiplier=1` to avoid head-of-line blocking on slow PDF jobs.
- `worker_max_tasks_per_child=200` to recycle leaked memory.
- Task routing: `papyrus.pdf.* → pdf` queue, `papyrus.cleanup.* → cleanup` queue.

## Long-lived runtime loop

`workers/runtime.py` runs **one** asyncio event loop in a background thread for the entire
worker process. All async task code goes through `run_async(coro)` which schedules onto that
loop via `run_coroutine_threadsafe`.

```python
@celery_app.task(name="papyrus.pdf.compress", bind=True, ...)
def compress(self, job_id: str) -> str:
    run_async(_run_compress(self.request.id, UUID(job_id)))
    return job_id
```

**Never** call `asyncio.run(...)` inside tasks — that creates and destroys an event loop, and
with it the SQLAlchemy engine, Redis pool, and aioboto3 client. The runtime initializes those
once per worker process (`worker_process_init`) and disposes them on shutdown
(`worker_process_shutdown`).

## Cleanup tasks (Celery Beat)

`workers/beat_schedule.py` registers:

- `cleanup-expired-artifacts` every 15 min — purge `storage_objects` with `purpose=output` older
  than `job_result_ttl_seconds` (default 24h).
- `cleanup-orphaned-uploads` every 30 min — purge unconfirmed `storage_objects` + documents
  with no version.
- `cleanup-anonymous-accounts` hourly — purge `users` + `organizations` with
  `is_anonymous=true` and `created_at < now() - 24h`.

## Adding a worker task

1. Pure PDF function in `services/pdf/<tool>.py`.
2. Process adapter in `workers/tasks/pdf_tools.py` (or `pdf_pipeline.py` for multi-input):

   ```python
   async def _foo_process(input_path, output_path, params) -> dict[str, Any]:
       result = await anyio.to_thread.run_sync(lambda: foo(input_path=input_path, ...))
       return {"output_size_bytes": result.output_size_bytes, ...}

   foo_task = _make_task(
       name="papyrus.pdf.foo",
       process=_foo_process,
       label="foo",
       extension="pdf",
       content_type="application/pdf",
   )
   ```

3. `JobKind.FOO` in `domain/jobs/enums.py`.
4. `create_foo_job` on `JobService`.
5. Route in `api/v1/jobs.py`.
6. Filename suffix in `_SUFFIX_BY_KIND`.
7. Retry branch in `JobService.retry`.

## SSE events

Workers `publish` to Redis pubsub channel `job-events:<job_id>`. The API SSE endpoint
(`GET /api/v1/jobs/{id}/events`) subscribes to that channel and forwards. Cancel works by
setting `job:cancel:<id>` in Redis + publishing CANCELLED.
