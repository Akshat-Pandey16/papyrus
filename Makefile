SHELL := /bin/bash
VENV := .venv
UV := $(if $(wildcard $(HOME)/.local/bin/uv),$(HOME)/.local/bin/uv,uv)
UV_RUN := UV_PROJECT_ENVIRONMENT=$(VENV) $(UV) run --package papyrus-api
ALEMBIC := $(UV_RUN) alembic -c apps/api/alembic.ini
PYTHON_VERSION := 3.13

export UV_PROJECT_ENVIRONMENT := $(VENV)

.DEFAULT_GOAL := help
.PHONY: help setup venv install upgrade api worker beat web \
        db-upgrade db-downgrade db-revision db-reset \
        lint format typecheck test test-api test-web build clean distclean

help:  ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- Setup -----------------------------------------------------------
setup:  ## One-shot bootstrap (installs system deps + project deps). See scripts/setup.sh.
	bash scripts/setup.sh

venv:  ## Create the project-local Python virtualenv at .venv
	$(UV) venv $(VENV) --python $(PYTHON_VERSION)

install: venv  ## Install Python + Node dependencies into .venv and node_modules
	$(UV) sync --all-packages --all-groups
	pnpm install

upgrade:  ## Bump every Python + Node dep to its latest version (regenerates lockfiles)
	$(UV) sync --all-packages --all-groups --upgrade
	pnpm -r update --latest
	pnpm dedupe
	pnpm install
	corepack use pnpm@latest

# ---- Application processes (run natively, no containers) ------------
api:  ## Run the FastAPI server with reload
	$(UV_RUN) uvicorn papyrus_api.main:create_app --factory --host 0.0.0.0 --port 8000 --reload

worker:  ## Run a Celery worker
	$(UV_RUN) celery -A papyrus_api.workers.celery_app:celery_app worker --loglevel=INFO --concurrency=4

beat:  ## Run the Celery beat scheduler
	$(UV_RUN) celery -A papyrus_api.workers.celery_app:celery_app beat --loglevel=INFO

web:  ## Run the Vite dev server
	pnpm --filter @papyrus/web dev

# ---- Database --------------------------------------------------------
db-upgrade:  ## Apply migrations to head
	$(ALEMBIC) upgrade head

db-downgrade:  ## Roll back one migration
	$(ALEMBIC) downgrade -1

db-revision:  ## Autogenerate a migration. Usage: make db-revision m="add users table"
	$(ALEMBIC) revision --autogenerate -m "$(m)"

db-reset:  ## Drop the dev database and re-apply all migrations
	bash scripts/db_reset.sh

# ---- Quality gates ---------------------------------------------------
lint:  ## Lint Python + JS/TS
	$(UV) run ruff check .
	pnpm lint

format:  ## Format Python + JS/TS
	$(UV) run ruff format .
	pnpm format

typecheck:  ## Static type-check Python + TS
	$(UV) run mypy apps/api/src
	pnpm typecheck

test: test-api test-web  ## Run all tests

test-api:  ## Run API tests
	$(UV_RUN) pytest apps/api/tests

test-web:  ## Run web tests
	pnpm --filter @papyrus/web test

# ---- Build & clean ---------------------------------------------------
build:  ## Build all packages
	pnpm -r build

clean:  ## Remove build artifacts and caches (keeps .venv)
	rm -rf apps/web/dist apps/web/.vite
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

distclean: clean  ## clean + remove .venv and node_modules
	rm -rf $(VENV) node_modules apps/*/node_modules packages/*/node_modules
