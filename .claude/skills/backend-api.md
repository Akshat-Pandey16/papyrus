---
name: backend-api
description: FastAPI route patterns, dependency injection, error envelope, middleware order.
---

# Backend: API

## Layers

```
api/v1/*.py   ← parse + auth dep + call service + return schema. NO business logic.
services/     ← orchestrates repos + IO. Owns transactions.
repositories/ ← data access. flush() not commit().
domain/       ← ORM models.
schemas/      ← Pydantic v2 DTOs. NEVER send ORM models on the wire.
```

## Route template

```python
from papyrus_api.api.deps import CurrentPrincipal, JobServiceDep, rate_limit

@router.post(
    "/compress",
    response_model=JobOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[rate_limit("jobs.compress", limit=120, window_seconds=300)],
)
async def create_compression_job(
    payload: CompressJobRequest,
    principal: CurrentPrincipal,
    service: JobServiceDep,
    response: Response,
) -> JobOut:
    user, organization = principal
    result = await service.create_compression_job(
        organization_id=organization.id,
        user_id=user.id,
        is_anonymous=user.is_anonymous,
        document_id=payload.document_id,
        compression_level=payload.compression_level,
        idempotency_key=payload.idempotency_key,
    )
    return job_to_out(result.job, phase="queued" if result.replay else None)
```

Pass `user.is_anonymous` so the service can branch quotas / size limits.

## Dependencies

`api/deps.py` provides:

- `DbSession` — yields one `AsyncSession`, rolls back on exception.
- `RedisDep` — process-pooled Redis client.
- `IdentityServiceDep`, `DocumentServiceDep`, `JobServiceDep`, `StorageServiceDep` — service
  factories with their dependencies wired.
- `CurrentPrincipal` — `(User, Organization)` from `Authorization: Bearer` JWT.
- `SsePrincipal` — same but also accepts a short-lived `papyrus_sse` cookie for EventSource.
- `rate_limit(scope, limit, window_seconds)` — returns a `Depends(...)`; uses Redis-Lua atomic
  fixed window keyed by IP.

## Error envelope (single shape)

```json
{
  "error": {
    "code": "document_not_found",
    "message": "Human-readable summary",
    "details": { "document_id": "..." },
    "request_id": "..."
  }
}
```

- All custom exceptions inherit from `AppError` (`core/errors.py`).
- Subclasses set `code` + `http_status`: `NotFoundError`, `ConflictError`, `ValidationError`,
  `AuthenticationError`, `PermissionError`, `QuotaExceededError`, `RateLimitedError`,
  `GoneError`, `UnsupportedMediaTypeError`, plus domain-specific.
- One FastAPI exception handler maps everything; never raw `HTTPException(...)` in services.

## Middleware order (top → bottom in `main.py`)

1. `SecurityHeadersMiddleware` — sets CSP-ish headers on every response.
2. `BodySizeLimitMiddleware` — 1 MiB cap on non-upload JSON.
3. `RequestIdMiddleware` — binds `request_id` to structlog context, echoes `X-Request-ID`.
4. `CORSMiddleware` — explicit method/header allowlist.

`setup_telemetry(app)` is called after `register_exception_handlers(app)` so OpenTelemetry sees
exception spans.

## Schemas

- Inbound payloads use `StrictModel` (`extra="forbid"`) — see `schemas/common.py`.
- Use Pydantic `Field(min_length=..., max_length=...)`, `field_validator`, `model_validator`.
- For request shapes: `_MutableModel` (extra=forbid, frozen=False).
- Outbound DTOs: `StrictModel` (frozen=True).
- `populate_by_name`/alias generators are forbidden on inbound payloads.

## Adding a new endpoint

1. Schema in `schemas/<resource>.py`.
2. Service method on the appropriate service class.
3. Route in `api/v1/<resource>.py`.
4. Register the router in `api/v1/__init__.py` if new resource.
5. If authenticated, declare `principal: CurrentPrincipal`.
6. If abuse-prone, add `rate_limit(...)` to `dependencies`.
