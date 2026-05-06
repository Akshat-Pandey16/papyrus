# API

> Stub. The OpenAPI schema is the source of truth — generated from FastAPI at runtime and exposed at `/api/v1/openapi.json`. Frontend types in `packages/shared-types` are derived from it.

## Versioning

- Routes mount under `/api/v{n}`. Breaking changes bump `n`.
- Within a major version, additive changes are allowed; field removals and type narrowings are not.

## Conventions

- JSON wire format is `snake_case`. The frontend converts to `camelCase` at the API boundary in `apps/web/src/lib/api/`.
- Pagination is cursor-based: list endpoints return `{ items, next_cursor }`. `limit` is capped server-side.
- Errors use the single envelope documented in `CLAUDE.md` §6.
- Request IDs propagate via `X-Request-ID` (echoed back on every response and in error envelopes).

## Authentication

- Bearer JWT in `Authorization: Bearer <token>` for browser sessions and API keys.
- Refresh tokens live in an httpOnly secure cookie scoped to `/api/v1/auth/refresh`.
- API keys are prefixed with `pk_` and presented in the same `Authorization: Bearer` header.
