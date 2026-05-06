# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /usr/local/bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
RUN uv sync --frozen --package papyrus-api --no-dev

COPY apps/api/src ./apps/api/src
RUN uv sync --frozen --package papyrus-api --no-dev

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 -g root papyrus

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app/apps/api /app/apps/api

WORKDIR /app/apps/api
USER 10001

EXPOSE 8000
ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "papyrus_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
