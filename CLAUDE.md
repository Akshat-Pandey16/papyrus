# Papyrus

A free, open-source, self-hostable PDF processing web app. Users can merge, split, compress, convert, OCR, sign, redact, edit metadata, reorder/rotate pages, and run other PDF operations through a fast browser UI backed by an async job pipeline.

This document is the source of truth for architecture, conventions, and tooling. Read it before scaffolding, refactoring, or adding new modules. Update it when conventions change — drift is a bug.

---

## 1. Product scope

- **Users**: anonymous + authenticated. Anonymous users can run lightweight jobs with quotas; authenticated users get persistence, history, larger files, and batch workflows.
- **Tenancy**: multi-tenant from day one (`organization_id` on every domain row). Single-tenant deploys are just a tenant of size 1.
- **File lifecycle**: uploads land in object storage (S3-compatible), are processed by Celery workers, results stream back via signed URLs, originals + outputs are TTL-purged.
- **Privacy posture**: zero-retention mode is a first-class deploy flag. Logs must never contain document content, file bytes, or extracted text.

---

## 2. Tech stack (pinned to latest idioms)

### Frontend
- **React 19** (use `use`, Actions, `useActionState`, `useOptimistic`, `useFormStatus`; Server Components are out of scope — this is a Vite SPA)
- **Vite** (latest) with `@vitejs/plugin-react-swc`
- **TypeScript** in `strict` + `noUncheckedIndexedAccess` mode
- **Tailwind CSS v4** (CSS-first config via `@theme`, no `tailwind.config.js`; use `@import "tailwindcss"`)
- **shadcn/ui** (canary/CLI generates components into `src/components/ui/` — they are owned code, edit freely)
- **TanStack Router** (file-based, fully typed routes)
- **TanStack Query v5** (server state; no Redux for server data)
- **Zustand** (small client-only state slices; never for server state)
- **React Hook Form + Zod** (forms + validation; the same Zod schemas are imported by API client types where possible)
- **Axios** with a single typed instance + interceptors, OR `ky` — pick one and stick with it; current default: **Axios** (interceptors for auth refresh + tracing headers)
- **pdf.js** for in-browser PDF preview/thumbnails
- **Vitest** + **React Testing Library** + **Playwright** (e2e)
- **Biome** for lint + format (single tool, not ESLint+Prettier)

### Backend
- **Python 3.13** (use PEP 695 generics, `type` aliases, `Self`, `override`, `TypedDict` with `Required`/`NotRequired`)
- **FastAPI** (latest) with `APIRouter` + dependency injection; lifespan via `asynccontextmanager`
- **Pydantic v2** (strict mode, `model_config = ConfigDict(...)`, no v1 idioms)
- **SQLAlchemy 2.x async** (`AsyncSession`, `Mapped[...]`, `mapped_column`, fully typed declarative models — no legacy Column/relationship-without-Mapped)
- **asyncpg** as the driver
- **Alembic** with autogenerate + manual review of every migration
- **Celery** for background jobs, **Redis** as broker + result backend; **redis-py** async for app-side cache
- **httpx** (async) for outbound HTTP — never `requests`
- **structlog** for structured JSON logs; OpenTelemetry SDK for traces/metrics
- **uv** for dependency management (`uv.lock` is committed; `pyproject.toml` is the only source of truth — no `requirements.txt`)
- **Ruff** (lint + format, replaces black/isort/flake8)
- **mypy --strict** (or **pyright strict**) — pick one; current default: **mypy strict**
- **pytest** + **pytest-asyncio** + **httpx.AsyncClient** for API tests; **testcontainers** for Postgres/Redis in integration tests

### Infra / runtime
- **PostgreSQL 17+** (single primary, read replicas optional; use logical schemas per concern, not per tenant)
- **Redis 7+** (broker, cache, rate-limit token buckets, idempotency keys)
- **S3-compatible object storage** (MinIO locally; AWS S3 / R2 / Backblaze in prod) — never store user files on local disk in app containers
- **No Docker in development.** All processes (API, worker, web) and all data services (Postgres, Redis, MinIO) are installed and run natively on the dev machine. Docker images and a Kubernetes Helm chart exist only under `infra/` for deployment
- **Nginx** or **Caddy** as TLS terminator + static asset server in front of the SPA bundle
- **GitHub Actions** for CI

### Dependency policy
- **Always run on the latest stable.** That means latest pnpm (pinned in `packageManager` and updated via `corepack use pnpm@latest`), latest uv, latest Node 24.x, latest Python 3.13.x, latest Biome (2.x), latest Ruff, latest TanStack/Vite/Tailwind/FastAPI/SQLAlchemy/Pydantic.
- Use carets (`^`) and `>=` constraints — not exact pins — for application dependencies, and run `make upgrade` regularly to bump every Python + Node dep to its latest version. The lockfiles (`uv.lock`, `pnpm-lock.yaml`) are committed and provide reproducibility within a given commit.
- A PR that lands a new dependency at anything other than its current latest stable needs a written reason in the description (e.g. a known regression in the latest).

---

## 3. Repository layout

Monorepo, two top-level apps (`apps/web`, `apps/api`), shared code in `packages/`. Use **pnpm workspaces** for the JS side and **uv workspaces** for the Python side.

```
papyrus/
├── CLAUDE.md
├── README.md
├── LICENSE                          # AGPL-3.0 or Apache-2.0 — decide before first public commit
├── .editorconfig
├── .gitignore
├── .gitattributes
├── .nvmrc                           # Node version pin
├── .python-version                  # uv reads this
├── .env.example                     # exhaustive; real .env is gitignored
├── pnpm-workspace.yaml
├── package.json                     # workspace root, only devDeps + scripts
├── biome.json                       # workspace-wide lint/format config
├── pyproject.toml                   # uv workspace root
├── uv.lock
├── Makefile                         # thin task runner for common ops
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                   # lint + typecheck + test + build, matrix per app
│   │   ├── release.yml              # tag-driven, builds + pushes images
│   │   └── codeql.yml
│   ├── dependabot.yml
│   ├── CODEOWNERS
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docs/
│   ├── architecture.md              # diagrams, data flow, request lifecycle
│   ├── adr/                         # Architecture Decision Records, numbered
│   │   └── 0001-record-architecture-decisions.md
│   ├── api.md                       # generated from OpenAPI + hand-written guides
│   ├── operations.md                # runbooks, on-call, incident response
│   └── contributing.md
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile           # multi-stage; uv sync --frozen in builder, distroless final
│   │   ├── worker.Dockerfile        # shares base with api
│   │   └── web.Dockerfile           # multi-stage; pnpm build then nginx:alpine
│   ├── helm/                        # k8s charts (api, worker, beat, web, redis, postgres optional)
│   ├── terraform/                   # optional; cloud infra as code
│   └── nginx/
│       └── web.conf
│
├── scripts/
│   ├── db_reset.sh                  # drop + recreate the local dev DB (uses host psql)
│   └── seed.py                      # idempotent dev seed data
│
├── packages/
│   └── shared-types/                # OpenAPI-generated TS types consumed by web
│       ├── package.json
│       └── src/
│           └── index.ts             # re-export of openapi-typescript output
│
└── apps/
    ├── api/                         # FastAPI service + Celery workers (same image, different entrypoints)
    └── web/                         # React SPA
```

### `apps/api/` — FastAPI + Celery

Layered architecture: **api → services → repositories → models**. No layer skips down; no layer reaches up. Celery tasks live alongside services and reuse them — they are not a parallel codebase.

```
apps/api/
├── pyproject.toml                   # member of root uv workspace
├── alembic.ini
├── pytest.ini                       # or [tool.pytest.ini_options] in pyproject
├── src/
│   └── papyrus_api/
│       ├── __init__.py
│       ├── __main__.py              # `python -m papyrus_api` → uvicorn
│       ├── main.py                  # FastAPI app factory: create_app()
│       ├── lifespan.py              # startup/shutdown: db pool, redis, otel, s3 client
│       │
│       ├── core/                    # framework-agnostic primitives
│       │   ├── config.py            # pydantic-settings; one Settings class, env-driven
│       │   ├── logging.py           # structlog config, JSON in prod, pretty in dev
│       │   ├── telemetry.py         # OTel setup, trace/span helpers
│       │   ├── security.py          # password hashing (argon2), JWT, signed URLs
│       │   ├── pagination.py        # cursor pagination helpers
│       │   ├── errors.py            # AppError hierarchy + FastAPI exception handlers
│       │   ├── ids.py               # ULID/UUIDv7 generation
│       │   └── time.py              # tz-aware utc_now(), never naive datetimes
│       │
│       ├── db/
│       │   ├── base.py              # DeclarativeBase with naming convention + type annotation map
│       │   ├── session.py           # async engine, async_sessionmaker, get_session() dep
│       │   ├── mixins.py            # TimestampMixin, SoftDeleteMixin, TenantMixin
│       │   ├── types.py             # custom SQLA types (ULIDType, EncryptedStr, etc.)
│       │   └── migrations/          # Alembic
│       │       ├── env.py
│       │       ├── script.py.mako
│       │       └── versions/
│       │
│       ├── domain/                  # ORM models grouped by bounded context
│       │   ├── __init__.py          # imports all models so Alembic sees them
│       │   ├── identity/
│       │   │   ├── models.py        # User, Organization, Membership, ApiKey
│       │   │   └── enums.py
│       │   ├── billing/
│       │   │   └── models.py        # Plan, Subscription, UsageRecord
│       │   ├── documents/
│       │   │   └── models.py        # Document, DocumentVersion, StorageObject
│       │   ├── jobs/
│       │   │   └── models.py        # Job, JobEvent (status history)
│       │   └── audit/
│       │       └── models.py        # AuditLog (append-only)
│       │
│       ├── schemas/                 # Pydantic DTOs — never reuse ORM models on the wire
│       │   ├── common.py            # Page[T], ErrorResponse, IdParams
│       │   ├── identity.py
│       │   ├── documents.py
│       │   └── jobs.py
│       │
│       ├── repositories/            # data access; one class per aggregate root
│       │   ├── base.py              # generic AsyncRepository[Model, Id]
│       │   ├── users.py
│       │   ├── documents.py
│       │   └── jobs.py
│       │
│       ├── services/                # business logic; orchestrates repos + external IO
│       │   ├── identity_service.py
│       │   ├── document_service.py
│       │   ├── job_service.py
│       │   ├── pdf/                 # PDF domain logic, framework-free
│       │   │   ├── merge.py
│       │   │   ├── split.py
│       │   │   ├── compress.py
│       │   │   ├── ocr.py
│       │   │   ├── convert.py
│       │   │   └── redact.py
│       │   └── storage_service.py   # S3 wrapper: put/get/presign/delete
│       │
│       ├── api/                     # transport layer
│       │   ├── deps.py              # shared dependencies: current_user, db session, rate limiter
│       │   ├── router.py            # mounts versioned routers
│       │   └── v1/
│       │       ├── __init__.py
│       │       ├── health.py
│       │       ├── auth.py
│       │       ├── users.py
│       │       ├── organizations.py
│       │       ├── documents.py
│       │       ├── jobs.py
│       │       └── webhooks.py
│       │
│       ├── middleware/
│       │   ├── request_id.py        # X-Request-ID propagation
│       │   ├── tenant.py            # resolves tenant from JWT/API key, binds to context
│       │   ├── rate_limit.py        # Redis token bucket, per route + per principal
│       │   └── compression.py
│       │
│       ├── workers/                 # Celery
│       │   ├── celery_app.py        # Celery() factory, queues, routing
│       │   ├── beat_schedule.py     # periodic tasks
│       │   ├── base.py              # Task base class with structlog binding + tenant ctx
│       │   └── tasks/
│       │       ├── pdf_pipeline.py  # thin wrappers around services.pdf.*
│       │       ├── cleanup.py       # TTL purge of expired documents
│       │       └── notifications.py
│       │
│       ├── integrations/            # outbound clients, one module per provider
│       │   ├── s3.py
│       │   ├── stripe.py
│       │   └── email.py             # SES / Postmark / SMTP behind a Protocol
│       │
│       └── utils/                   # last resort; prefer a named module under core/
│
└── tests/
    ├── conftest.py                  # app + db fixtures, testcontainers
    ├── factories/                   # factory_boy / polyfactory
    ├── unit/                        # pure logic, no IO
    ├── integration/                 # hits real Postgres + Redis via testcontainers
    └── e2e/                         # boots full app via httpx.AsyncClient
```

### `apps/web/` — React 19 SPA

Feature-sliced layout. **Features own their routes, components, hooks, and API calls.** `components/` is for cross-feature primitives only. shadcn primitives live in `components/ui/` and are never imported by name from outside `components/`.

```
apps/web/
├── package.json
├── tsconfig.json                    # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── components.json                  # shadcn config
├── public/
└── src/
    ├── main.tsx                     # entry: createRoot, providers
    ├── app/
    │   ├── router.tsx               # TanStack Router root
    │   ├── providers.tsx            # QueryClient, Theme, Toaster, ErrorBoundary
    │   └── routes/                  # file-based routes, generated by TanStack Router
    │       ├── __root.tsx
    │       ├── index.tsx            # landing
    │       ├── tools/
    │       │   ├── merge.tsx
    │       │   ├── split.tsx
    │       │   └── compress.tsx
    │       ├── dashboard/
    │       │   ├── index.tsx
    │       │   ├── documents.tsx
    │       │   └── jobs.tsx
    │       └── auth/
    │           ├── login.tsx
    │           └── signup.tsx
    │
    ├── features/                    # feature slices — the bulk of the app
    │   ├── auth/
    │   │   ├── api.ts               # query/mutation hooks for this feature
    │   │   ├── components/
    │   │   ├── hooks/
    │   │   ├── schemas.ts           # zod
    │   │   └── types.ts
    │   ├── documents/
    │   ├── jobs/
    │   ├── pdf-merge/
    │   ├── pdf-split/
    │   ├── pdf-compress/
    │   ├── pdf-ocr/
    │   └── billing/
    │
    ├── components/
    │   ├── ui/                      # shadcn-generated primitives (Button, Dialog, etc.)
    │   ├── layout/                  # AppShell, Sidebar, Topbar
    │   └── shared/                  # cross-feature composites: FileDropzone, PdfPreview
    │
    ├── hooks/                       # generic, feature-agnostic hooks
    │   ├── use-debounced-value.ts
    │   ├── use-media-query.ts
    │   └── use-clipboard.ts
    │
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts            # axios instance, interceptors, auth refresh
    │   │   ├── query-client.ts      # TanStack Query defaults (retries, staleTime)
    │   │   └── endpoints.ts         # typed wrapper over generated openapi types
    │   ├── env.ts                   # zod-validated import.meta.env access
    │   ├── format.ts                # bytes, dates, durations
    │   ├── pdf.ts                   # pdf.js helpers (worker setup, thumbnails)
    │   └── utils.ts                 # cn(), tiny helpers; do not become a junk drawer
    │
    ├── stores/                      # zustand; one store per concern, never one mega-store
    │   ├── ui-store.ts              # sidebar open, theme override, modals
    │   └── upload-store.ts          # in-flight uploads (client-only state)
    │
    ├── styles/
    │   ├── globals.css              # @import "tailwindcss"; @theme { ... }; base layer
    │   └── prose.css
    │
    ├── types/
    │   ├── api.d.ts                 # generated from backend OpenAPI; DO NOT edit by hand
    │   └── env.d.ts
    │
    └── test/
        ├── setup.ts
        └── msw/                     # mock service worker handlers for component tests
```

---

## 4. Naming conventions

These are **non-negotiable**. Code that violates them gets fixed in review.

### Files & directories
- **Python**: `snake_case.py` for modules, `snake_case` for packages. Class-per-file is not required — group cohesive types.
- **TypeScript/React**:
  - Components: `kebab-case.tsx` files, `PascalCase` exports (e.g. `pdf-preview.tsx` exporting `PdfPreview`). One component per file unless trivially co-located.
  - Hooks: `use-*.ts` (e.g. `use-debounced-value.ts`).
  - Non-component modules: `kebab-case.ts`.
  - Route files follow TanStack Router conventions (`__root.tsx`, `index.tsx`, `$param.tsx`).
- **No `index.ts` barrel files** except at package public boundaries (`packages/*/src/index.ts`). Barrels hurt tree-shaking, slow Vite, and obscure imports.
- **Update README with every iteration if required**

### Identifiers
- Python functions/vars: `snake_case`. Classes: `PascalCase`. Constants: `UPPER_SNAKE`. Private: leading underscore.
- TS/JS functions/vars: `camelCase`. Components/types/enums: `PascalCase`. Constants: `UPPER_SNAKE`. Booleans: `is*`/`has*`/`can*`/`should*`.
- Avoid abbreviations except universal ones (`id`, `url`, `db`, `api`, `pdf`). No `usr`, `doc`, `proc`, `tmp` for new names.

### Database
- Tables: plural `snake_case` (`users`, `document_versions`).
- Columns: `snake_case`. Booleans: `is_*`/`has_*`. Timestamps: `*_at` (always `TIMESTAMPTZ`, UTC).
- Primary key: `id` (ULID/UUIDv7 stored as `UUID`). Foreign keys: `<singular>_id`.
- Indexes: `ix_<table>_<columns>`. Uniques: `uq_<table>_<columns>`. Checks: `ck_<table>_<rule>`. FKs: `fk_<table>_<ref_table>_<col>`. Configure SQLAlchemy's `MetaData(naming_convention=...)` so Alembic emits these automatically.
- Every domain table has: `id`, `organization_id` (tenant scope), `created_at`, `updated_at`. Soft-delete via `deleted_at` only when truly required.

### Database — indexing, uniqueness, and query patterns (mandatory)

These are the rules every migration and model must satisfy. Reviewers reject PRs that don't.

**Uniqueness**
- Natural keys (`email`, `slug`, `prefix`, `token_hash`, `(organization_id, name)` for nameable resources) **must** carry a unique constraint or unique index. Do not enforce uniqueness only in app code.
- Composite uniqueness (e.g. `memberships(user_id, organization_id)`) is declared with `UniqueConstraint`, never as "we'll just check before insert."

**Indexing — required by default**
- Every foreign key column has an index (Postgres does **not** index FKs automatically). Single-column FK → `index=True` on the `mapped_column`.
- Every column used in an authenticated `WHERE` clause is indexed: `email` lookups for login, `token_hash` for password resets, `prefix` for API keys, etc.
- Multi-tenant scoped queries get a **composite** index that puts `organization_id` first and the next-most-selective column second: `ix_<table>_org_<col>` (e.g. `ix_jobs_organization_id_status`, `ix_documents_organization_id_created_at`).
- "Latest N per parent" patterns (`ORDER BY created_at DESC LIMIT 1` or paginated lists) need a covering composite index on `(parent_id, created_at)` — never rely on the FK index alone for ordered queries.
- Lookups on partial state (`used_at IS NULL`, `revoked_at IS NULL`, `deleted_at IS NULL`) get a **partial index** when the filtered set is a small minority of the table:
  ```python
  Index("ix_password_reset_tokens_active", "token_hash", postgresql_where=text("used_at IS NULL"))
  ```
- Time-range scans (`expires_at < now()`, cleanup jobs) need a btree index on the time column.
- Don't pile on indexes. Each index slows writes — every index must justify itself by an actual query that uses it.

**Naming**
- All constraint and index names follow the convention map in `db/base.py` (already configured). Hand-written index names use the same prefix scheme: `ix_<table>_<columns>`, `uq_<table>_<columns>`, partial indexes append a suffix describing the predicate (`ix_<table>_<col>_active`).

**Query rules**
- **Never** `SELECT *` over the network unintentionally. Specify columns when reads are hot. SQLAlchemy `select(User.id, User.email)` over `select(User)` for projections.
- **Always** include `organization_id` in the `WHERE` clause for tenant-scoped tables. Repository methods take `organization_id` as a required parameter — there is no "global" helper that bypasses tenant scoping.
- **Bounded results.** Every list query has a `LIMIT`. Pagination uses cursor pagination on indexed `(created_at, id)` — no `OFFSET` for user-facing endpoints.
- **No N+1.** When loading a parent and its children, use `selectinload`/`joinedload` or batch-fetch by ID set with `WHERE id IN (...)`. Never loop and re-query.
- **Single round-trip per logical step.** If you need user + org + memberships, fetch them in one `select(...).join(...)` rather than three sequential `await session.get(...)` calls.
- **Transactions are explicit and short.** A request opens one session (FastAPI dep), commits once at the end of the unit of work, rolls back on exception. Never call `commit()` mid-request just to flush — use `session.flush()` for that.
- **`flush()` not `commit()`** inside repository methods. Repos do not commit; services do. This keeps transaction boundaries with business logic.
- **Never** issue queries inside Python comprehensions or generators that hide await behavior.

### API
- Routes: plural nouns, kebab-case where multi-word (`/api/v1/document-versions`).
- Versioned under `/api/v{n}`; breaking changes bump `n`. Never silently break v1.
- Idiomatic verbs: `GET` list/detail, `POST` create, `PATCH` partial update, `PUT` full replace (rarely used), `DELETE` remove.
- Response envelope: return resources directly for single, `{ items, next_cursor }` for paginated lists. Errors use a single shape (see §6).
- Request/response IDs and field names are `snake_case` in JSON — Pydantic `populate_by_name` + alias generators are forbidden for inbound payloads (avoid case-mismatch bugs). The frontend is camelCase internally; convert at the API boundary in `lib/api/`.

### Git & commits
- Branches: `feat/<scope>-<short-desc>`, `fix/...`, `chore/...`, `refactor/...`, `docs/...`.
- Commits: **Conventional Commits** (`feat(documents): add presigned upload`).
- One logical change per PR. PRs over ~400 lines need a written reason in the description.

---

## 5. Code style rules

### Universal
- **No dead code.** If it's commented out, delete it. Git remembers.
- **No TODO without an issue link.** `# TODO(#123): ...` or it doesn't ship.
- **No comments in code.** No `#` comments in Python, no `//` or `/* */` in TS. Names and types are the documentation.
- **No docstrings.** Not on modules, not on classes, not on functions — in any language. Python files do not start with a triple-quoted string. TypeScript files do not have JSDoc blocks. Anything that needs prose lives in `docs/` or in the OpenAPI schema.
- **Errors are values at boundaries, exceptions inside.** API/worker boundaries map exceptions to typed responses; internal code raises.
- **No magic numbers.** Named constants in `core/config.py` or feature-local constants module.
- **Configuration via env vars only.** Twelve-factor. No reading files at runtime for config.

### Python (apps/api)
- **Async all the way.** No `time.sleep`, no sync `requests`, no sync DB calls. If a sync lib is unavoidable, isolate it via `anyio.to_thread.run_sync`.
- **Type everything.** Public functions and methods must have full type annotations. Use PEP 695 (`def foo[T](...) -> T:`) and `type` aliases. `Any` requires a justifying comment.
- **Pydantic v2 strict.** `ConfigDict(strict=True, extra="forbid", frozen=True)` for DTOs unless mutation is required.
- **SQLAlchemy 2.x style only.**
  ```python
  class User(Base, TimestampMixin):
      __tablename__ = "users"
      id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
      email: Mapped[str] = mapped_column(unique=True, index=True)
  ```
  Never legacy `Column(...)` without `Mapped[...]`.
- **Sessions are short-lived.** One session per request (FastAPI dep) or per task. Never share sessions across awaits in different logical operations.
- **Repositories return domain models or DTOs, never `Row` or `Result` objects.** Services orchestrate; routes thin.
- **Routes are dumb.** Parse → call service → return schema. No business logic in `api/v1/*.py`.
- **Use `Annotated[Type, Depends(...)]`** for FastAPI deps to keep signatures readable.
- **Logging**: `log = structlog.get_logger(__name__)`. Bind context (`request_id`, `tenant_id`, `job_id`) at middleware/task entry; never pass them through call args, create common logger for proper logging, swithc to save logs in file or show properly in terminal when in dev mode.
- **No print statements anywhere.**
- **Migrations**: every PR that changes models must include an Alembic migration with a hand-written downgrade. Squashing is allowed pre-1.0; after 1.0, never edit a released migration.
- **Lint/format**: `ruff check` + `ruff format`. Configure in `pyproject.toml`. Selected rules: `E,F,W,I,UP,B,SIM,RUF,N,ANN,ASYNC,S,PERF,PL`.

### TypeScript (apps/web)
- **`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.** All three.
- **No `any`.** Use `unknown` and narrow. ESLint/Biome rule enforces.
- **No default exports** except where the framework requires them (route files for TanStack Router). Named exports are searchable and refactor-safe.
- **Props are explicit interfaces** named `<Component>Props`. No inline `{ a, b }: { a: string; b: number }` for non-trivial components.
- **Server state lives in TanStack Query.** Client state lives in component state or Zustand. **Never** mirror server data into Zustand.
- **Forms**: React Hook Form + Zod resolver. The Zod schema is the single source of truth for validation; derive types via `z.infer`.
- **API calls** go through `lib/api/endpoints.ts` (typed wrappers) and are consumed via feature-local `api.ts` hooks (`useDocumentsQuery`, `useCreateJobMutation`). Components never call axios directly.
- **Tailwind v4**: design tokens live in `styles/globals.css` under `@theme`. No arbitrary color hex values in components — extend the theme.
- **shadcn components** in `components/ui/` are owned code; edit them when needed. Don't wrap them in trivial pass-through components.
- **Accessibility is not optional.** Every interactive element has a name, every form field has a label, every dialog traps focus. Use Radix primitives (which shadcn uses) and don't break their semantics.
- **Performance**: lazy-load route bundles, use `React.lazy` for heavy components (PDF viewer), debounce expensive inputs, virtualize long lists with `@tanstack/react-virtual`.
- **No `useEffect` for data fetching.** That's TanStack Query's job. Effects are for syncing with non-React systems only.

### Frontend — performance and rendering rules (mandatory)
- **Subscribe narrowly to Zustand.** Always pass a selector: `useStore((s) => s.user)`, never `const { user } = useStore()`. Multi-field reads use multiple subscriptions; do not return new object literals from selectors (they re-render every tick).
- **Stable references.** Memoize event handlers and derived values with `useCallback` / `useMemo` only when they cross a memo boundary or feed `useEffect` deps — don't memoize for the sake of it.
- **TanStack Query keys are tuples**, not template strings. Centralize per-feature in `<feature>/api.ts` as `featureKeys`. Mutations explicitly `setQueryData` or `invalidateQueries` — never both.
- **Avoid waterfalls.** Multiple queries that don't depend on each other are issued in parallel via `useQueries`, not chained `useQuery` calls.
- **Layout discipline.** Pages are full-bleed by default — no `max-w-3xl mx-auto` blog-style wrappers on application pages. Constrain content with `max-w-screen-2xl` inside a `mx-auto` only when that's the chosen design language for that surface. Use `w-full` on outer sections so chrome stretches edge-to-edge.
- **Mobile-first.** Every layout works at 360px wide. Use `min-h-svh` (small viewport) instead of `min-h-screen` to handle mobile browser chrome. Tap targets ≥44px (`h-11` or larger for primary actions). Test at iPhone SE width before merging UI work.
- **Forms.** React Hook Form + Zod resolver. The Zod schema is the single source of truth — derive types via `z.infer`. Inputs always have a stable `id` matching the `htmlFor` of their label. Show inline errors with `aria-invalid` + `role="alert"`. Disable submit while pending; show a busy label.
- **Bundle hygiene.** Every route is automatically code-split by TanStack Router — don't import a route module from outside its file. Lazy-load expensive client-only libs (pdf.js, charting) at usage time. Manual chunks live in `vite.config.ts`.
- **No prop drilling beyond two levels.** If state is shared across more than two components, hoist it to a Zustand store (client state) or TanStack Query (server state) — don't add a context.
- **No global mutation outside stores/queries.** Components mutate via mutation hooks; stores own client state writes. Do not reach into `localStorage` or `window.*` from a component — wrap it in a hook or a store action.
- **Errors stay typed.** Throw `ApiError` from `lib/api/client`; UI components switch on `error.code`, never `error.message.includes(...)`.

---

## 6. Cross-cutting concerns

### Errors
Single error envelope across the API:
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
- Backend: `AppError` base class with `code`, `http_status`, `details`. Subclass per domain (`DocumentNotFound`, `QuotaExceeded`). One FastAPI exception handler maps everything.
- Frontend: a single `parseApiError` in `lib/api/` produces a typed `AppError` for UI to switch on.

### Auth
- JWT access tokens (short-lived, ~15 min) + refresh tokens (rotating, stored httpOnly secure cookie).
- API keys for programmatic access, scoped to organization, hashed at rest (argon2id).
- Every authenticated request resolves `current_user` and `current_organization` via FastAPI deps; both are bound to structlog context and OTel span attributes.

### Multi-tenancy
- `organization_id` is on every domain row. Repositories require it as a parameter — there is no "global" query helper that bypasses tenant scoping.
- Consider Postgres RLS as defense-in-depth once stable; not required for v1 if app-layer scoping is rigorously reviewed.

### Rate limiting & quotas
- Redis token bucket middleware, keyed by `(principal_id, route_group)`.
- Anonymous users: per-IP. Authenticated: per-user. API keys: per-key.
- Quotas (file size, pages, jobs/day) are enforced in `services/`, not middleware — they're business rules, not transport concerns.

### Background jobs
- All long PDF operations go to Celery. The HTTP request returns a `Job` resource immediately; the client polls `/jobs/{id}` or subscribes via SSE/WebSocket (decide before scaffolding; **default: SSE** — simpler, works through proxies).
- Tasks are **idempotent**: re-running a task with the same `job_id` produces the same result. Use Redis `SETNX` on `job_id` for at-most-once side effects when needed.
- Task failures surface as `JobEvent` rows; the worker never silently swallows exceptions.

### Observability
- **Logs**: structured JSON, one event per line, with `request_id`, `tenant_id`, `user_id`, `job_id` where applicable.
- **Metrics**: Prometheus via OTel; RED metrics on every route and task.
- **Traces**: OTel auto-instrumentation for FastAPI, SQLAlchemy, httpx, Celery, redis-py.
- **Never log file content, full request bodies, tokens, or secrets.** A redaction processor is wired into structlog.

### Storage
- All file IO goes through `services/storage_service.py`. No direct boto3 calls scattered across the codebase.
- Uploads use **presigned PUT URLs** — bytes never touch the API container. The API issues the URL, the client uploads to S3 directly, then notifies the API to start the job.
- Outputs use **presigned GET URLs** with short TTLs.

### Testing
- **Unit tests**: pure logic, no IO, fast. Target: services/ and pdf/ logic.
- **Integration tests**: real Postgres + Redis via testcontainers; one transaction per test, rolled back.
- **API tests**: `httpx.AsyncClient(app=app)` against the in-process app.
- **E2E**: Playwright against a docker-compose stack; smoke-only, not exhaustive.
- **Coverage** is a signal, not a target. Critical paths (auth, billing, PDF pipeline) need explicit tests.

### Security
- Secrets via env vars, loaded by `pydantic-settings`. Never committed. `.env.example` lists every key with a dummy value.
- Dependencies scanned by Dependabot + `pip-audit` / `pnpm audit` in CI.
- CSP, HSTS, X-Content-Type-Options, Referrer-Policy set on the web bundle's nginx config.
- Uploaded PDFs are processed in worker containers with **no network egress** (egress firewall rule) — defense against malicious PDFs that try to phone home.
- Run workers as non-root, with read-only root filesystem and a tmpfs scratch dir.

---

## 7. Tooling commands (canonical)

The `Makefile` wraps these; agents and humans should prefer the underlying tools when debugging.

### Python (apps/api)
```bash
uv sync                              # install deps, create .venv
uv run ruff check . && uv run ruff format .
uv run mypy src
uv run pytest
uv run alembic revision --autogenerate -m "add documents table"
uv run alembic upgrade head
uv run uvicorn papyrus_api.main:create_app --factory --reload
uv run celery -A papyrus_api.workers.celery_app worker -l info
uv run celery -A papyrus_api.workers.celery_app beat -l info
```

### Node (apps/web, packages/*)
```bash
pnpm install
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test
pnpm -r typecheck
pnpm -r lint
pnpm dlx shadcn@latest add button     # run from apps/web/
pnpm --filter shared-types generate   # regenerate OpenAPI types
```

### Local stack
Postgres, Redis, and MinIO are installed and run natively — no Docker in development.

First-time bootstrap on a fresh machine:
```bash
make setup        # installs system deps (Postgres, Redis, Node, uv), downloads MinIO,
                  # creates papyrus DB role + database, installs project deps, runs migrations.
                  # Idempotent — safe to re-run. ASSUME_YES=1 to skip prompts; SKIP_SYSTEM=1 to skip OS-level installs.
```

The Python venv lives at `./.venv` — created by `make venv` (or implicitly by `make install`) and pinned for every recipe via `UV_PROJECT_ENVIRONMENT`. Never reach into a global Python.

Day-to-day, run each process in its own terminal:
```bash
bash scripts/run_minio.sh   # generated by setup; starts MinIO on :9000 (console :9001)
make api          # FastAPI on :8000
make worker       # Celery worker
make web          # Vite dev server on :5173
```

---

## 8. Decisions still open (resolve before scaffolding the relevant module)

These are intentionally not pre-decided. When the user asks to scaffold a section that depends on one, surface the question first.

1. **License**: AGPL-3.0 (strong copyleft, fits "free + open-source PDF tool" positioning) vs Apache-2.0 (permissive, easier corp adoption).
2. **Real-time channel**: SSE (default leaning) vs WebSocket — driven by whether bidirectional streaming is ever needed.
3. **Type checker**: mypy strict (default) vs pyright strict — pick one and configure CI.
4. **HTTP client on web**: Axios (default) vs ky vs native fetch wrapper.
5. **PDF engine choices** per operation — pikepdf, pypdf, qpdf, ocrmypdf, Ghostscript, Tesseract: settle when implementing each `services/pdf/*` module; some are GPL and affect license choice (#1).
6. **Auth provider**: roll-your-own (default for OSS friendliness) vs delegate to Authentik/Keycloak via OIDC.

---

## 9. Working with this codebase as an agent

- **Default to the structure above.** If a task seems to want a new top-level directory, push back — almost everything has a home already.
- **Never scaffold code unless the user asks.** This document is the contract; code comes after explicit requests.
- **When adding a feature**, the order is: schema (Pydantic + Zod) → migration → repository → service → route → frontend feature slice → tests. Skipping steps creates drift.
- **When in doubt about idioms**, prefer the latest stable framework idiom over what's familiar. This codebase is greenfield — there's no legacy to preserve.
- **Update this file** when a convention changes. A PR that introduces a new pattern without updating CLAUDE.md is incomplete.
