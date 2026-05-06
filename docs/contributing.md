# Contributing

Thanks for your interest in Papyrus. Read [`../CLAUDE.md`](../CLAUDE.md) first — it is the source of truth for architecture, conventions, and code style.

## Workflow

1. Fork and create a branch named `feat/<scope>-<short-desc>`, `fix/...`, etc.
2. Run `make install` once. Run `make lint typecheck test` before pushing.
3. Open a PR. One logical change per PR. PRs over ~400 lines need a written reason in the description.
4. Use Conventional Commits in commit titles (`feat(documents): add presigned upload`).

## Adding a feature

In order:

1. Define the schema (Pydantic on the API, Zod on the web).
2. Write the Alembic migration with a hand-written downgrade.
3. Add the repository, then the service, then the route.
4. Add the frontend feature slice under `apps/web/src/features/`.
5. Tests at every layer that has logic.

## Code review

- Reviewers check correctness, security, and conformance to `CLAUDE.md`.
- Lint, typecheck, and tests must be green before merge.
- Migrations are reviewed line by line — no exceptions.
