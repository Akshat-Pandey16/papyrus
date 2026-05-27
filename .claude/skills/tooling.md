---
name: tooling
description: Local dev commands, lint/typecheck/build invocations, dep management for uv + bun.
---

# Tooling commands

## First-time setup

```bash
make setup          # installs uv/Python/Node/bun, starts Docker infra (PG/Redis/LocalStack), runs migrations
                    # ASSUME_YES=1 to skip prompts; SKIP_SYSTEM=1 to skip OS package installs
```

Python venv lives at `./.venv` (created by `make venv` / `make install`). Recipes pin
`UV_PROJECT_ENVIRONMENT` so we never reach into a global Python.

## Day-to-day

Run each in its own terminal:

```bash
make infra-up               # Postgres :5432, Redis :6379, LocalStack S3 :4566 (Docker)
make api                    # FastAPI on :8000
make worker                 # Celery worker
make web                    # Vite on :5173 (in pdf-tools branches, includes dev HMR)
```

## Python (apps/api)

```bash
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv sync                     # install/refresh deps
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run ruff check apps/api
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run ruff format apps/api
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run mypy apps/api/src
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run pytest apps/api/tests/unit
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run alembic revision --autogenerate -m "..."
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run alembic upgrade head
```

## JS (bun)

bun is the package manager + runtime. Workspaces are declared via `workspaces` in the root
`package.json` (`apps/*`, `packages/*`); `@papyrus/shared-types` is linked with `workspace:*`.
If a dependency needs its postinstall script to run, add it to `trustedDependencies` in the root
`package.json` (currently `msw`).

```bash
bun install                                  # install/refresh; --frozen-lockfile in CI
bun run --filter @papyrus/web dev            # Vite dev server
bun run --filter @papyrus/web build          # production build
bun run --filter @papyrus/web test           # vitest (runs once outside watch)
bun run typecheck                            # tsc -b across all workspaces
bun run lint                                 # biome check . (root)
```

The committed lockfile is `bun.lock` (text). `make upgrade` runs `bun update --latest` +
`uv sync --upgrade`.

## Vite cache invalidation

When you change `vite.config.ts`, the bundler swaps a plugin, or the manualChunks list shifts,
the browser may keep hitting stale chunk URLs. Recovery:

```bash
rm -rf apps/web/node_modules/.vite
# restart dev server and hard-refresh the browser (Cmd/Ctrl+Shift+R)
```

## Object storage (LocalStack)

S3-compatible local storage via LocalStack at `:4566` (`docker compose` service `localstack`).
Buckets `papyrus-uploads` / `papyrus-outputs` are created by `infra/localstack/init-s3.sh` on
boot (with CORS) and also by `StorageService.ensure_bucket`. Credentials default to `test / test`
(LocalStack accepts anything); see `s3_endpoint_url` / `s3_access_key_id` in settings. MinIO was
dropped — its project was archived in 2026.

## Database reset (destructive)

```bash
bash scripts/db_reset.sh        # drops + recreates the dev DB
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run alembic upgrade head
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run python scripts/seed.py
```

## Smoke test the FastAPI app

```bash
UV_PROJECT_ENVIRONMENT=$PWD/.venv uv run python -c "
from papyrus_api.main import create_app
app = create_app()
print(sorted({r.path for r in app.routes if hasattr(r, 'path')}))
"
```

## OCR system deps (optional)

OCR needs `ocrmypdf`, `tesseract-ocr`, `ghostscript` on the worker host. Until installed,
`POST /api/v1/jobs/ocr` returns 503 with `ocr_not_configured`. Install on Ubuntu/Debian:

```bash
sudo apt install -y ocrmypdf tesseract-ocr tesseract-ocr-eng ghostscript
# extra language packs: tesseract-ocr-{fra,deu,spa,jpn,chi-sim,hin,…}
```
