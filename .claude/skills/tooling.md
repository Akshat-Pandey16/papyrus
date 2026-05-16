---
name: tooling
description: Local dev commands, lint/typecheck/build invocations, dep management for uv + pnpm.
---

# Tooling commands

## First-time setup

```bash
make setup          # installs Postgres/Redis/Node/uv, downloads MinIO, creates DB, runs migrations
                    # ASSUME_YES=1 to skip prompts; SKIP_SYSTEM=1 to skip OS installs
```

Python venv lives at `./.venv` (created by `make venv` / `make install`). Recipes pin
`UV_PROJECT_ENVIRONMENT` so we never reach into a global Python.

## Day-to-day

Run each in its own terminal:

```bash
bash scripts/run_minio.sh   # MinIO on :9000 (console :9001)
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

## Node (apps/web)

`pnpm dep-check` runs before every script — if pnpm 11 reports `ERR_PNPM_IGNORED_BUILDS`,
the build dependency needs an entry in `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

```bash
CI=true pnpm install --no-frozen-lockfile         # after dep changes
node apps/web/node_modules/typescript/bin/tsc -b  # typecheck
/path/to/.bin/biome check . --write               # lint + format from apps/web/
node apps/web/node_modules/vite/bin/vite.js build # production build
node apps/web/node_modules/vitest/vitest.mjs --run # tests
```

Or via the workspace scripts when pnpm is happy:

```bash
pnpm --filter @papyrus/web dev
pnpm --filter @papyrus/web build
pnpm --filter @papyrus/web typecheck
pnpm --filter @papyrus/web lint
pnpm --filter @papyrus/web test
```

## Vite cache invalidation

When you change `vite.config.ts`, the bundler swaps a plugin, or the manualChunks list shifts,
the browser may keep hitting stale chunk URLs. Recovery:

```bash
rm -rf apps/web/node_modules/.vite
# restart dev server and hard-refresh the browser (Cmd/Ctrl+Shift+R)
```

## MinIO

S3-compatible local storage at `:9000` (API) and `:9001` (web console). Buckets are auto-created
on boot via `StorageService.ensure_bucket`. Credentials default to
`papyrus / papyrus-secret` (see `s3_access_key_id` / `s3_secret_access_key` in settings).

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
