---
name: conventions
description: Naming + style conventions for files, identifiers, DB, API, Git. Non-negotiable.
---

# Conventions

## Files & directories

- **Python**: `snake_case.py` modules, `snake_case` packages. No class-per-file requirement.
- **TypeScript**:
  - Components: `kebab-case.tsx` files, `PascalCase` exports (`pdf-preview.tsx` → `PdfPreview`).
  - Hooks: `use-*.ts`.
  - Other modules: `kebab-case.ts`.
  - Route files follow TanStack Router conventions (`__root.tsx`, `index.tsx`, `$param.tsx`).
- **No `index.ts` barrels** except at package boundaries (`packages/*/src/index.ts`).

## Identifiers

- Python: `snake_case` for functions/vars, `PascalCase` for classes, `UPPER_SNAKE` for constants,
  leading `_` for private.
- TS: `camelCase` for functions/vars, `PascalCase` for components/types/enums, `UPPER_SNAKE` for
  constants. Booleans: `is*`/`has*`/`can*`/`should*`.
- Universal abbreviations OK (`id`, `url`, `db`, `api`, `pdf`). No `usr`, `doc`, `proc`, `tmp`.

## Database

- Tables: plural `snake_case` (`users`, `document_versions`).
- Columns: `snake_case`. Booleans: `is_*`/`has_*`. Timestamps: `*_at` (always `TIMESTAMPTZ`, UTC).
- Primary key: `id` (UUIDv7 via `uuid-utils`). FKs: `<singular>_id`.
- Index names: `ix_<table>_<columns>`. Unique: `uq_<table>_<columns>`. Check: `ck_<table>_<rule>`.
  FK: `fk_<table>_<ref_table>_<col>`. Configured via SQLAlchemy `MetaData(naming_convention=...)`
  in `db/base.py`.
- Every domain table has: `id`, `organization_id` (tenant scope), `created_at`, `updated_at`.

See [`backend-db.md`](backend-db.md) for indexing rules.

## API

- Routes: plural nouns, kebab-case where multi-word (`/api/v1/document-versions`).
- Versioned under `/api/v{n}`.
- Verbs: `GET` list/detail, `POST` create, `PATCH` partial update, `PUT` full replace (rare),
  `DELETE` remove.
- Response shape: resource directly for single, `{ items, next_cursor }` for paginated lists.
- **JSON keys are `snake_case` everywhere.** Frontend is `camelCase` internally; convert at the
  API boundary in `lib/api/`. Do not use Pydantic alias generators on inbound payloads.

## Git

- Branches: `feat/<scope>-<desc>`, `fix/...`, `chore/...`, `refactor/...`, `docs/...`.
- Commits: **Conventional Commits** (`feat(documents): add presigned upload`).
- One logical change per PR. PRs over ~400 lines need a written justification.

## Code style (universal)

- **No dead code.** Commented-out code is deleted.
- **No TODO without an issue link.** `# TODO(#123): ...` or it doesn't ship.
- **No comments in code.** No `#`/`//` comments. Names + types do the documenting.
- **No docstrings anywhere.** Modules don't start with triple-quoted strings. TS files have no
  JSDoc. Prose lives in `docs/` or the OpenAPI schema.
- **Errors are values at boundaries, exceptions inside.** Map exceptions at the API/worker edge.
- **No magic numbers.** Named constants in `core/config.py` or feature-local constants module.
- **Configuration via env vars only.** Twelve-factor.
