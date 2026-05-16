# Papyrus

A free, open-source, self-hostable PDF toolkit. Anonymous-first UX: any visitor can drop a file
and run a tool without signing up. Privacy is the differentiator — zero-retention mode,
no logs of file content, files purged on a TTL, S3-presigned uploads so bytes never touch the API
container.

## Product success bar (do not lose sight of this)

The goal is: **a user who currently reaches for iLovePDF/Smallpdf would switch to Papyrus and
keep using it**. The decisive things, in order:

1. **Zero-friction activation.** Land on a tool page, drop a file, get a result, leave. No signup.
   Anonymous users get a real (short-lived) session minted on first use.
2. **Tool breadth.** Compress, Merge, Split, Rotate, Reorder, OCR are shipped. Sign and Redact
   are next. Until "the long tail of casual PDF tasks" is covered, this is not the default tool.
3. **Auto-download on completion.** When a job finishes, the file downloads. No extra click.
4. **Page thumbnails the moment a file is dropped.** That's the "this tool understands my file"
   moment. Renders client-side via pdfjs-dist.
5. **Privacy story is real, not marketing.** Zero-retention flag is wired through, anon accounts
   are purged in 24h, logs redact sensitive keys, uploaded bytes bypass the API container.

When making product trade-offs, optimize for **a one-shot anonymous user finishing their task in
under 60 seconds**. Authenticated features (history, sessions, settings) are an upgrade path,
not a gate.

## Tech stack (latest stable, no exceptions)

- **Frontend**: React 19 SPA, Vite 8 (Rolldown) + `@vitejs/plugin-react`, TypeScript strict +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, Tailwind v4, shadcn primitives,
  TanStack Router (file-based, auto code-split), TanStack Query v5, Zustand for client state,
  React Hook Form + Zod, Axios with one interceptor pipeline, pdfjs-dist (client-side rendering),
  Biome (lint + format), Vitest + Playwright.
- **Backend**: Python 3.13, FastAPI, Pydantic v2 strict, SQLAlchemy 2.x async + asyncpg,
  Alembic, Celery + Redis, aioboto3 (one shared client), structlog, OpenTelemetry, argon2,
  pyjwt, pikepdf, ocrmypdf (system dep), uuid-utils (UUIDv7), uv for deps, Ruff, mypy --strict.
- **Infra**: PostgreSQL 17+, Redis 7+, S3-compatible object storage (MinIO locally).
  Native processes in dev (no Docker). Docker/Helm under `infra/` is for deploy only.

## Skills — load these when working in specific areas

The detailed conventions, patterns, and "how to add a new X" recipes live in modular skill files
under `.claude/skills/`. Load the one that matches the task instead of carrying everything in
the prompt.

| Topic                                  | Skill file                                              |
| -------------------------------------- | ------------------------------------------------------- |
| Repo layout / monorepo structure       | [`.claude/skills/repo-structure.md`](.claude/skills/repo-structure.md) |
| Engineering baseline (security + perf) | [`.claude/skills/engineering-baseline.md`](.claude/skills/engineering-baseline.md) |
| Naming + style conventions             | [`.claude/skills/conventions.md`](.claude/skills/conventions.md) |
| Database (models, indexes, migrations) | [`.claude/skills/backend-db.md`](.claude/skills/backend-db.md) |
| API routes + error envelope            | [`.claude/skills/backend-api.md`](.claude/skills/backend-api.md) |
| Auth (anonymous, refresh, sessions)    | [`.claude/skills/backend-auth.md`](.claude/skills/backend-auth.md) |
| PDF tools service layer + workers      | [`.claude/skills/backend-pdf-tools.md`](.claude/skills/backend-pdf-tools.md) |
| Celery workers + runtime loop          | [`.claude/skills/backend-workers.md`](.claude/skills/backend-workers.md) |
| Frontend architecture + layouts        | [`.claude/skills/frontend-architecture.md`](.claude/skills/frontend-architecture.md) |
| Frontend data fetching + state         | [`.claude/skills/frontend-data.md`](.claude/skills/frontend-data.md) |
| Adding a new PDF tool (FE + BE)        | [`.claude/skills/add-new-tool.md`](.claude/skills/add-new-tool.md) |
| Tooling commands + local dev           | [`.claude/skills/tooling.md`](.claude/skills/tooling.md) |

## Working with this repo as an agent

- **Do not scaffold without an explicit request.** This file is the contract; code comes after.
- **Update the relevant skill file** when a convention changes. Skills are the single source of
  truth for their topic; CLAUDE.md only declares the product vision and stack.
- **Latest stable for everything.** Carets, not pins. PRs that land deps below latest need a
  written justification (known regression, etc.).
- **No comments in code.** No `# TODO` without an issue. Names + types do the documenting.
- **No docstrings.** Anywhere. Prose lives in `docs/` or the OpenAPI schema.
- **Errors are values at boundaries, exceptions inside.** Single envelope across the API.
- **Async all the way.** No sync HTTP, no sync DB, no `time.sleep`.

## Open decisions

These remain unresolved; surface them when the relevant module is touched:

1. License — AGPL-3.0 vs Apache-2.0.
2. Real-time channel — SSE (current default) vs WebSocket.
3. Frontend HTTP client — Axios (current) vs ky vs native fetch.
4. PDF engine specifics per future tool (pikepdf vs pypdf vs qpdf vs Ghostscript).
5. Auth provider — roll-our-own vs delegate to Authentik/Keycloak via OIDC.
