# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter @papyrus/web build

FROM nginx:1.27-alpine AS runtime

COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
