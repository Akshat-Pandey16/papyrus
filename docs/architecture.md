# Architecture

> Stub. Expand with diagrams and request lifecycles as the system takes shape.

## Components

- **Web** (`apps/web`) — React 19 SPA. Static bundle served by nginx in production. Talks to the API over HTTPS using JWT bearer tokens (in-memory access token, httpOnly refresh cookie).
- **API** (`apps/api`) — FastAPI service. Stateless. Horizontal scaling behind a load balancer. Owns all writes to Postgres, all reads of S3, and enqueues jobs to Celery.
- **Workers** (`apps/api`, different entrypoint) — Celery consumers. Run PDF transformations, write outputs to S3, update job state.
- **Postgres** — system of record for users, organizations, documents (metadata only), jobs, audit log.
- **Redis** — Celery broker + result backend, app cache, rate-limit token buckets, idempotency keys.
- **Object storage** (S3-compatible) — raw uploads and processed outputs. Documents never touch the API or worker filesystem persistently.

## Request lifecycle: PDF merge

1. Client uploads files via presigned PUT URLs issued by `POST /api/v1/documents:presign-upload`.
2. Client calls `POST /api/v1/jobs/merge` with the document IDs and ordering.
3. API validates the request, creates a `Job` row in `pending`, enqueues a Celery task, returns the `Job` resource.
4. Worker picks up the task, streams inputs from S3, runs the merge in a temp dir, uploads the result, updates `Job` to `succeeded` and writes a `JobEvent`.
5. Client polls `GET /api/v1/jobs/{id}` (or subscribes via SSE) and downloads the result via a presigned GET URL.

## Boundaries

- API and workers share the same code image but expose **no shared mutable state** beyond Postgres and Redis.
- Services in `services/pdf/` are framework-agnostic: they take filesystem paths or byte streams and produce outputs. They do not import FastAPI or Celery.
