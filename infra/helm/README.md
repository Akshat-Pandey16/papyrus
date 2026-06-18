# Papyrus deploy manifests

Reference Kubernetes manifests with production hardening (non-root, resource
limits, probes). Apply `manifests.yaml` after creating a `papyrus-secrets`
Secret (JWT_SECRET, TOKEN_PEPPER, DATABASE_URL, REDIS_URL, S3 creds) and a
`papyrus-config` ConfigMap (PAPYRUS_ENV, API_CORS_ORIGINS, S3 buckets).

The web image must be built with `--build-arg VITE_API_BASE_URL=https://<api-host>`
(see `infra/docker/web.Dockerfile`).
