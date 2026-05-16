---
name: backend-pdf-tools
description: PDF service modules (compress, merge, split, rotate, reorder, OCR), job pipeline, idempotency, presigned uploads.
---

# Backend: PDF tools

## Architecture

```
services/pdf/<tool>.py      ← framework-free pure function: input path → output path + stats
workers/tasks/pdf_*.py      ← Celery task that orchestrates download → process → upload → notify
services/job_service.py     ← create_*_job methods that build params + reserve quota + enqueue
api/v1/jobs.py              ← thin route per job kind
```

## Service module (the pure PDF function)

```python
# services/pdf/split.py
def split_pdf(*, input_path: Path, output_path: Path, ranges: str) -> SplitResult:
    if not input_path.exists(): raise FileNotFoundError(...)
    if input_path.stat().st_size == 0: raise PdfMalformedError(...)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc: raise PdfEncryptedError(...) from exc
    except pikepdf.PdfError as exc: raise PdfMalformedError(...) from exc
    # ... do the work ...
    return SplitResult(...)
```

Rules:

- No DB, no Redis, no S3 inside `services/pdf/*`. Pure file I/O.
- Always handle `PasswordError` → `PdfEncryptedError`, `PdfError` → `PdfMalformedError`.
- Output to `output_path` even if zipped (use `.zip` for split).
- Return a `*Result` dataclass with input/output bytes + any tool-specific stats.

## Existing tools

| Tool     | Module                       | Strategy                                            |
| -------- | ---------------------------- | --------------------------------------------------- |
| Compress | `pdf/compress.py`            | pikepdf save with stream compression + Pillow JPEG  |
| Merge    | `pdf/merge.py`               | pikepdf `pages.extend` across inputs                |
| Split    | `pdf/split.py`               | pikepdf per-range, zip the outputs                  |
| Rotate   | `pdf/rotate.py`              | pikepdf `page.rotate(deg, relative=True)`           |
| Reorder  | `pdf/reorder.py`             | new pikepdf doc, append in user order               |
| OCR      | `pdf/ocr.py`                 | shell out to `ocrmypdf`; degrade if not installed   |

OCR requires `ocrmypdf` + `tesseract` + `gs` on PATH. `ensure_ocr_runtime()` raises
`OcrNotConfiguredError` (HTTP 503, code `ocr_not_configured`) when missing.

## Job pipeline pattern

Single-input/single-output tools share `workers/tasks/pdf_tools.py:_run_simple_job`:

1. Acquire a Redis lock keyed by `job:lock:<job_id>` so retries don't double-run.
2. Load the job; bail if it's already terminal.
3. Mark `RUNNING`, emit `phase: "downloading"`.
4. `storage.download_to_path(...)` from `input_bucket/key`.
5. Emit `phase: "processing"`, run the pure tool function via `anyio.to_thread.run_sync`.
6. Emit `phase: "uploading"`, `storage.upload_from_path(...)` to outputs bucket.
7. Create + confirm a `StorageObject` for the output, `mark_succeeded`, append final event.
8. Publish on Redis pubsub `job-events:<job_id>` for the SSE consumer.
9. On `_TransientStorageError`, Celery retries with backoff + jitter (max 3).
10. On `_JobCancelledError`, publish `CANCELLED` and return cleanly.
11. On `PdfEncryptedError` / `PdfMalformedError` / `OcrNotConfiguredError`, fail with the
    structured `code` + `message`.

Compress + Merge predate the shared helper and live in `workers/tasks/pdf_pipeline.py` with
their own (parallel) code paths. New tools should use `_run_simple_job` via `_make_task(...)`.

## Job creation in `JobService`

`_create_simple_job(...)` builds the params dict, enforces quota + size limits (anon-aware),
inserts the row, appends the PENDING event, publishes the PENDING state, then `send_task` to
Celery. Idempotency: `(organization_id, idempotency_key)` unique partial index — replay returns
the same job.

Each tool gets a thin wrapper that calls `_create_simple_job` with its kind, params, and task
name:

```python
async def create_split_job(self, *, organization_id, user_id, document_id, ranges, ...):
    return await self._create_simple_job(
        organization_id=organization_id,
        user_id=user_id,
        document_id=document_id,
        idempotency_key=idempotency_key,
        is_anonymous=is_anonymous,
        kind=JobKind.SPLIT,
        extra_params={"ranges": ranges},
        task_name="papyrus.pdf.split",
    )
```

## Retry

`JobService.retry` accepts a failed/cancelled job and rebuilds the create-job call with the same
inputs but a new idempotency key. New tool kinds must be added to the retry branches.

## Output filename suffix

`_SUFFIX_BY_KIND` in `services/job_service.py` decides the download filename suffix
(`-split.zip`, `-rotated.pdf`, etc.). Add an entry when adding a tool.

## Storage

`StorageService` (`services/storage_service.py`) holds **one** aioboto3 client for the lifetime
of the process — never `async with session.client(...)` per call. The lifespan closes it on
shutdown via `close_storage()`. Workers also depend on the same single-client pattern (the
`workers/runtime.py` event loop holds it for the worker process).
