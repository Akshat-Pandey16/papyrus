---
name: repo-structure
description: Map of the Papyrus monorepo — where to put new code, where to find existing modules.
---

# Repo structure

Monorepo with two apps (`apps/web`, `apps/api`) and shared packages. **bun workspaces** on the JS
side, **uv workspaces** on the Python side.

```
papyrus/
├── CLAUDE.md
├── package.json               # bun workspaces (apps/*, packages/*); trustedDependencies (msw)
├── bun.lock                   # committed JS lockfile
├── compose.yaml               # dev infra: Postgres + Redis + LocalStack (S3)
├── pyproject.toml             # uv workspace root + ruff/mypy config
├── uv.lock                    # committed
├── Makefile                   # thin wrapper: make api / web / worker / infra-up / setup
├── .claude/skills/            # modular skill files (this dir)
├── apps/
│   ├── api/                   # FastAPI + Celery, see backend-* skills
│   └── web/                   # React SPA, see frontend-* skills
├── packages/
│   └── shared-types/          # OpenAPI-generated TS types consumed by web
├── infra/                     # Dockerfiles, Helm, localstack/init-s3.sh
└── scripts/                   # setup, db_reset, seed
```

## Backend (`apps/api/src/papyrus_api/`)

Layered: **api → services → repositories → models**. Layers don't skip down or reach up.

```
core/         # config, security, logging, errors, rate_limit, cookies, ids, time, telemetry
db/           # session, base, mixins, migrations/versions/
domain/       # SQLAlchemy models grouped by bounded context (identity/, documents/, jobs/)
schemas/      # Pydantic DTOs — NEVER reuse ORM models on the wire
repositories/ # data access; one class per aggregate root
services/     # business logic; orchestrates repos + IO
  pdf/        # framework-free PDF operations (compress, merge, split, rotate, reorder, ocr)
api/v1/       # transport layer; one file per resource (auth, users, documents, jobs, health)
middleware/   # request_id, security_headers, body_size_limit
workers/      # Celery
  runtime.py  # process-level event loop (keep DB/Redis/S3 connections alive)
  tasks/      # pdf_pipeline (compress + merge), pdf_tools (split/rotate/reorder/ocr), cleanup
integrations/ # outbound clients (redis, future stripe, email)
```

## Frontend (`apps/web/src/`)

Feature-sliced. Features own routes, components, hooks, API calls.

```
app/          # routing + providers (router.tsx, providers.tsx, routes/)
  routes/     # file-based TanStack Router (index, login, signup, dashboard, settings, tools/*)
components/
  layout/     # app-shell, app-sidebar, app-header, app-mobile-drawer, topbar
  theme/      # theme-provider, theme-toggle
  shared/     # cross-feature composites (anonymous-banner, error-boundary)
  ui/         # shadcn primitives (button, card, input, label, form-field)
features/
  auth/       # session-bootstrap, ensure-session, api/store/schemas/types/components/
  account/    # change-password, sessions, email-verify, profile (settings UI)
  pdf-compress/  # the canonical compress feature; many hooks shared by others
  pdf-merge/  # merge — reuses compress's API hooks + store
  pdf-tools/  # shared helpers for split/rotate/reorder/ocr (use-single-file-job, ToolJobCard, PageThumbnails)
hooks/        # generic, feature-agnostic
lib/api/      # client (axios + interceptors), query-client, endpoints
stores/       # zustand stores (ui-store with theme + sidebar persistence)
styles/       # globals.css with @theme tokens + dark mode
test/         # vitest setup + msw handlers
```

**Rule**: features own their state. The exception is `pdf-merge` and `pdf-tools` reusing the
existing upload + job-stream hooks from `pdf-compress` rather than duplicating them. That's
pragmatic because they share the upload/job/SSE lifecycle exactly.

## Where to put new things

- New PDF operation? See [`add-new-tool.md`](add-new-tool.md).
- New auth flow? `services/identity_service.py` + `api/v1/auth.py`.
- New domain model? `domain/<context>/models.py` + Alembic migration.
- New cross-feature React composite? `components/shared/`.
- New page? `app/routes/<path>.tsx` — TanStack Router picks it up via the plugin.

## What to NOT add

- No `index.ts` barrel files outside `packages/*/src/index.ts`.
- No new top-level directories. Almost everything has a home.
- No docstrings, no `# TODO` without an issue link.
