# 1. Record architecture decisions

Date: TBD

## Status

Accepted.

## Context

We need a lightweight way to capture architectural decisions and their rationale, so future contributors and agents can understand why the system looks the way it does without re-litigating settled questions.

## Decision

We will use Architecture Decision Records, as described by Michael Nygard, stored in `docs/adr/` and numbered sequentially. Each ADR records: status, context, decision, and consequences. Superseded ADRs remain for historical record and link to their replacement.

## Consequences

- A new ADR is required for changes that alter the system's shape (storage, transport, auth model, deployment topology).
- Day-to-day code changes do not need an ADR.
- ADRs are immutable once accepted; revisions happen as new ADRs that supersede the old one.
