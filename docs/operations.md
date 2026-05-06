# Operations

> Stub. Expand with runbooks as production deploys come online.

## Deployment topology

Three workloads, each independently scalable:

- **api** (`apps/api`, `papyrus_api.main:create_app` entrypoint) — N replicas behind an L7 load balancer.
- **worker** (`apps/api`, Celery worker entrypoint) — autoscaled on queue depth.
- **beat** (`apps/api`, Celery beat entrypoint) — exactly one replica.

Workers run with **no network egress** by default — defense against malicious PDFs phoning home. Egress to S3 is allow-listed via firewall rules.

## Health checks

- `GET /healthz` — liveness. Returns 200 if the process is up.
- `GET /readyz` — readiness. Checks Postgres + Redis + S3 reachability. Used by k8s.

## Observability

- Logs ship to the platform's log aggregator as JSON.
- Metrics scraped from `/metrics` (Prometheus exposition).
- Traces exported via OTLP to the platform's collector.

## Incident response

To be filled in once we have an on-call rotation.
