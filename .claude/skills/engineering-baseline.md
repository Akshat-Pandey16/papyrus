---
name: engineering-baseline
description: Non-negotiable security, performance, and correctness rules that apply to every change.
---

# Engineering baseline

Every PR must satisfy these. Violations need a written justification in the description.

## Security

- **Secrets never appear in JSON, query strings, logs, or commits.** Carriers: httpOnly cookies
  (browser), `Authorization` headers (server), secret managers (operators).
- **Refresh tokens are opaque random bytes**, stored as HMAC-SHA256 hashes peppered with
  `jwt_secret`. Never plain SHA-256. JWT for access tokens only.
- **Refresh rotation with reuse detection.** Every refresh issues a new token and revokes the old.
  Presenting a revoked refresh token revokes the entire token family (chain of descendants).
- **Refresh cookie**: httpOnly, `SameSite=Lax`, `Secure` in any non-development env, path-scoped
  to `/api/v1/auth`.
- **Constant-time compare** for any secret-equivalence check (`hmac.compare_digest`).
- **Argon2 params**: OWASP 2024 baseline (`m=19456, t=2, p=1`). Configurable via settings.
- **No PII / document content in logs.** structlog has a redactor — extend `_REDACTED_KEYS` for
  any new sensitive key, never rely on luck.
- **CORS**: explicit allow-list via `API_CORS_ORIGINS`. Never `allow_origins=["*"]` with
  `allow_credentials=True`.
- **CSP / HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / COOP / CORP**
  set by `SecurityHeadersMiddleware`. Don't loosen.
- **Body-size middleware** caps JSON requests at 1 MiB. Uploads use presigned PUT, not the API.
- **Rate-limit auth routes** with `rate_limit("scope", limit=N, window_seconds=W)`. Lookup by IP
  (X-Forwarded-For-aware). Use the Redis Lua-script limiter in `core/rate_limit.py`.
- **Tenant scoping is the repository's job**, not the route's. Every read/write on a tenant table
  takes `organization_id` and adds it to WHERE. No global helpers that cross tenants.
- **Validate at the edge, trust inside.** Pydantic v2 strict in; Zod in browser.

## Performance

- **Every list endpoint paginates.** Cursor pagination on `(created_at, id)`. No `OFFSET` for
  user-facing endpoints.
- **Every FK column is indexed.** Postgres does **not** index FKs automatically. Composite
  indexes lead with `organization_id` for tenant-scoped queries.
- **Partial indexes for active subsets** (`WHERE used_at IS NULL`, `WHERE revoked_at IS NULL`,
  `WHERE confirmed_at IS NULL`, etc.) when the active subset is small.
- **Single round-trip per logical step.** N+1 queries are a defect, not a style issue. Use
  `selectinload`/`joinedload` or batch via `WHERE id IN (...)`.
- **Sessions commit at the boundary.** Repos `flush()`, services `commit()`. Never hold a session
  across an external HTTP call.
- **Async all the way.** No sync HTTP (`requests`), no sync DB, no `time.sleep`. Unavoidable
  sync work goes through `anyio.to_thread.run_sync`.
- **Pre-warmed pools.** DB + Redis + S3 client created in lifespan, never per-request.
  S3 client is one process-wide `aioboto3` client.
- **Worker lifecycle**: DB, Redis, S3 init once per worker process. The dedicated event loop in
  `workers/runtime.py` runs all tasks; **never** dispose engine/redis per task.
- **No client-side fan-out.** When the UI needs N+1 things, the API returns N+1 things — never
  make the browser stitch.
- **Bundle budget**: each route under 50 kB gzip, initial JS under 150 kB gzip. Heavy libs
  (pdfjs-dist) are lazy-loaded at usage time, not at app boot.

## Observability

For every new endpoint and worker task:

- Bind `request_id`, `user_id`, `organization_id`, `job_id` (if applicable) to structlog context.
- Emit one structured event per significant outcome (`auth.login`, `documents.upload.confirmed`,
  `jobs.failed`) — not every line of code.
- Every error response carries a `request_id` so support can trace.

## Frontend correctness

- **Strict Mode safe.** Effects survive double-invoke in dev.
- **No data fetching in `useEffect`.** TanStack Query owns server state.
- **Subscribe narrowly to Zustand**: `useStore((s) => s.user)`. Never destructure (re-renders
  every tick).
- **Errors are typed.** Throw `ApiError` from `lib/api/client`; UI switches on `error.code`, never
  `error.message.includes(...)`.
- **Forms are RHF + Zod.** Schema is the source of truth; types are inferred. `aria-invalid` on
  bad fields; submit disabled while pending.

## Definition of Done (per PR)

A change is not done until all of these are true:

1. **Backend**: `uv run ruff check` clean, `uv run mypy` clean, alembic revision included if
   models changed, unit test for the new path.
2. **Database**: every new FK is indexed, every tenant query is composite-indexed, every "active"
   filter has a partial index where appropriate.
3. **Frontend**: `tsc -b` clean, `biome check` clean, `vite build` clean, page works at 360px
   wide, page works on hard refresh.
4. **Security**: no secret in logs/responses; new authenticated routes declare the principal dep;
   new tenant tables go through repos that take `organization_id`.
5. **Observability**: structured log at the boundary; context bound at entry.
