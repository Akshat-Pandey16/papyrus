---
name: add-new-tool
description: Step-by-step recipe for shipping a new single-input single-output PDF tool, end-to-end (DB → service → worker → API → frontend).
---

# Add a new PDF tool (e.g. "watermark")

This recipe assumes a tool that takes one PDF + parameters and produces one PDF. For multi-input
tools (like merge), see how `pdf_pipeline.py` handles merge.

## 1. Backend: pure tool function

`apps/api/src/papyrus_api/services/pdf/watermark.py`:

```python
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import pikepdf
from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError

@dataclass(slots=True, frozen=True)
class WatermarkResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int

def watermark_pdf(*, input_path: Path, output_path: Path, text: str) -> WatermarkResult:
    if input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        pdf = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("PDF appears to be malformed.") from exc
    try:
        # do the work …
        pdf.save(str(output_path))
    finally:
        pdf.close()
    return WatermarkResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=len(pdf.pages),
    )
```

Pure: no DB, no Redis, no S3. Map pikepdf errors to our domain errors.

## 2. Backend: JobKind enum

`apps/api/src/papyrus_api/domain/jobs/enums.py` — add `WATERMARK = "watermark"`.

(Adding an enum value doesn't require a migration in our setup — the Postgres enum is generated
on first table create. For new enum values on **existing** enum columns, you do need a migration.
Check the alembic env config.)

## 3. Backend: schemas

`apps/api/src/papyrus_api/schemas/jobs.py`:

```python
class WatermarkJobRequest(_MutableModel):
    document_id: UUID
    text: str = Field(min_length=1, max_length=120)
    idempotency_key: UUID
```

## 4. Backend: worker task

`apps/api/src/papyrus_api/workers/tasks/pdf_tools.py`:

```python
async def _watermark_process(input_path, output_path, params) -> dict[str, Any]:
    text = params.get("text")
    if not isinstance(text, str):
        raise AppError("Watermark text missing.")
    result = await anyio.to_thread.run_sync(
        lambda: watermark_pdf(input_path=input_path, output_path=output_path, text=text)
    )
    return {
        "output_size_bytes": result.output_size_bytes,
        "input_size_bytes": result.input_size_bytes,
        "page_count": result.page_count,
    }

watermark_task = _make_task(
    name="papyrus.pdf.watermark",
    process=_watermark_process,
    label="watermark",
)
```

## 5. Backend: service method

`apps/api/src/papyrus_api/services/job_service.py`:

```python
async def create_watermark_job(
    self, *, organization_id, user_id, document_id, text,
    idempotency_key, is_anonymous=False,
) -> CreateJobResult:
    return await self._create_simple_job(
        organization_id=organization_id,
        user_id=user_id,
        document_id=document_id,
        idempotency_key=idempotency_key,
        is_anonymous=is_anonymous,
        kind=JobKind.WATERMARK,
        extra_params={"text": text},
        task_name="papyrus.pdf.watermark",
    )
```

Add a retry branch and an entry in `_SUFFIX_BY_KIND` (`JobKind.WATERMARK: "watermarked"`).

## 6. Backend: route

`apps/api/src/papyrus_api/api/v1/jobs.py`:

```python
@router.post("/watermark", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_watermark_job_route(
    payload: WatermarkJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_watermark_job(
        organization_id=organization.id,
        user_id=user.id,
        document_id=payload.document_id,
        text=payload.text,
        idempotency_key=payload.idempotency_key,
        is_anonymous=user.is_anonymous,
    )
    if result.replay:
        response.status_code = status.HTTP_200_OK
    phase = "queued" if result.job.status == JobStatus.PENDING else None
    return job_to_out(result.job, phase=phase)
```

## 7. Frontend: API hook

`apps/web/src/features/pdf-tools/api.ts`:

```ts
export type WatermarkJobInput = {
  documentId: string;
  text: string;
  idempotencyKey: string;
};

export function useCreateWatermarkJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WatermarkJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/watermark", {
        document_id: input.documentId,
        text: input.text,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}
```

## 8. Frontend: route

`apps/web/src/app/routes/tools/watermark.tsx` — copy the structure of `split.tsx` and swap the
options panel for your inputs. Use `useSingleFileJobRunner` to handle upload + create-job +
SSE + auto-download.

## 9. Frontend: navigation

- `components/layout/app-sidebar.tsx` — add to `TOOLS_NAV`.
- `components/layout/app-header.tsx` — add `"/tools/watermark": "Watermark PDF"` to `TITLES`.
- `components/layout/app-mobile-drawer.tsx` — add to `ITEMS`.
- `app/routes/dashboard.tsx` — add a tile in `TOOLS` if it should appear on the dashboard.
- `app/routes/index.tsx` — optional, add to the landing-page tool grid.

## 10. Tests + verification

- `pytest apps/api/tests/unit` — write a unit test for the pure tool function with a small
  fixture PDF.
- `node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build` — clean build.
- `uv run ruff check apps/api && uv run mypy apps/api/src` — clean.

## Anti-checklist

- Don't reach into `pdf_pipeline.py` for new single-input tools; use `pdf_tools.py` / `_make_task`.
- Don't add the JobKind to multiple lists separately — `_SUFFIX_BY_KIND` and the retry switch
  must stay in sync.
- Don't accept anonymous-incompatible quotas silently — the route passes `user.is_anonymous` and
  the service branches.
