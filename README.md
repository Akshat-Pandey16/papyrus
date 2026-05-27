# Papyrus

> A free, open-source, self-hostable PDF processing web app.

Merge, split, compress, convert, OCR, sign, redact, edit metadata, reorder/rotate pages, and more — through a fast browser UI backed by an async job pipeline. Privacy-first: zero-retention mode, no logging of document content, files purged on TTL.

## Status

Alpha. **Anonymous mode is live** — visit a tool page, drop a PDF, get a result, no signup
required. Implemented tools: compress, merge, split, rotate, reorder, OCR. Sign and redact
are next.

## Stack

- **Web**: React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Router + Query, Zustand, React Hook Form + Zod
- **API**: FastAPI, Python 3.13, Pydantic v2, SQLAlchemy 2.x async, asyncpg, Alembic
- **Workers**: Celery + Redis
- **Storage**: PostgreSQL 18, Redis 8, S3-compatible object store (LocalStack locally)
- **Tooling**: uv (Python), bun (JS), Ruff, mypy, Biome, Vitest, pytest, Playwright

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, conventions, and code-style contract.

## Prerequisites

Dev infrastructure (Postgres, Redis, LocalStack S3) runs in Docker Compose; the app processes
(API, worker, web) run natively.

- [Docker](https://docs.docker.com/engine/install/) Engine + Compose v2 plugin
- Node 24+ (`.nvmrc`) and [bun](https://bun.sh) 1.3+
- Python 3.13 (`.python-version`) and [uv](https://github.com/astral-sh/uv) 0.5+
- **For OCR**: `ocrmypdf`, `tesseract-ocr`, and `ghostscript` on PATH (optional — OCR is the only
  tool that needs these; everything else uses pikepdf). See [OCR setup](#ocr-setup) below.

`make infra-up` starts Postgres (`:5432`), Redis (`:6379`), and LocalStack S3 (`:4566`, buckets
auto-created). Docker / Kubernetes are also used for deployment — see [`infra/`](./infra/).

## OCR setup

OCR shells out to `ocrmypdf`, which depends on Tesseract and Ghostscript. Without them, the OCR
endpoint returns `HTTP 503` with `code: "ocr_not_configured"` — every other tool keeps working.

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y ocrmypdf tesseract-ocr tesseract-ocr-eng ghostscript
```

Add language packs as needed (the UI exposes English, French, German, Spanish, Italian,
Portuguese, Dutch, Chinese Simplified, Japanese, Korean, Hindi, Arabic):

```bash
sudo apt install -y \
  tesseract-ocr-fra \
  tesseract-ocr-deu \
  tesseract-ocr-spa \
  tesseract-ocr-ita \
  tesseract-ocr-por \
  tesseract-ocr-nld \
  tesseract-ocr-chi-sim \
  tesseract-ocr-jpn \
  tesseract-ocr-kor \
  tesseract-ocr-hin \
  tesseract-ocr-ara
```

### macOS (Homebrew)

```bash
brew install ocrmypdf tesseract ghostscript
brew install tesseract-lang   # all extra language packs in one go
```

### Fedora / RHEL

```bash
sudo dnf install -y ocrmypdf tesseract tesseract-langpack-eng ghostscript
```

### Arch / Manjaro

```bash
sudo pacman -S --needed ocrmypdf tesseract tesseract-data-eng ghostscript
```

### Verify

```bash
which ocrmypdf tesseract gs && tesseract --list-langs
```

You should see paths for all three and at least `eng` in the language list. Restart the Celery
worker after installing (the OCR runtime check runs on every job, but a worker restart is the
cleanest way to surface the change).

### Docker / Helm deploys

The worker image in [`infra/docker/worker.Dockerfile`](./infra/docker/worker.Dockerfile) should
include `RUN apt-get install -y ocrmypdf tesseract-ocr-* ghostscript`. The OCR pipeline runs in
the worker container only, so the API image does not need it.

## Quick start

On a fresh machine, one command installs toolchains (uv, Python, Node, bun), starts the Docker
infra (Postgres + Redis + LocalStack S3), installs project deps, and applies migrations:

```bash
make setup
```

Run `bash scripts/setup.sh` directly if you want to inspect or pass `ASSUME_YES=1` / `SKIP_SYSTEM=1`.

After setup, the infra is already running. Start the app processes (each in its own terminal):

```bash
make api                     # http://localhost:8000
make worker
make web                     # http://localhost:5173
```

Manage the Docker infra and redo the project-side install as needed:

```bash
make infra-up                # start Postgres + Redis + LocalStack (S3 on :4566)
make infra-down              # stop (keeps data);  make infra-reset wipes volumes
make install                 # creates .venv via uv, runs bun install
make db-upgrade
```

## Layout

```
papyrus/
├── apps/
│   ├── api/          # FastAPI service + Celery workers
│   └── web/          # React 19 SPA
├── packages/
│   └── shared-types/ # OpenAPI-generated TS types
├── infra/            # Dockerfiles, nginx, helm — deploy artifacts only
├── docs/             # Architecture, ADRs, runbooks
└── scripts/          # Dev utilities
```

## Contributing

Read [`CLAUDE.md`](./CLAUDE.md) and [`docs/contributing.md`](./docs/contributing.md). Conventional Commits, one logical change per PR, tests required for non-trivial changes.

## License

To be decided before the first public release. See `CLAUDE.md` §8.
