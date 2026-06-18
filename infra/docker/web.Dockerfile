# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14 AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=""
ARG VITE_APP_NAME="Papyrus"
ARG VITE_MAX_FILE_BYTES="524288000"
ARG VITE_SENTRY_DSN=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_MAX_FILE_BYTES=$VITE_MAX_FILE_BYTES \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter @papyrus/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8080/ || exit 1

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
