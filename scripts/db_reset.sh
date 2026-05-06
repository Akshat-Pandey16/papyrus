#!/usr/bin/env bash
# Drop and recreate the dev database, then re-apply all migrations.
# Destructive — only intended for local development.
# Assumes Postgres is running natively and `psql` is on PATH.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${PAPYRUS_ENV:-development}" != "development" ]]; then
  echo "Refusing to reset DB outside development (PAPYRUS_ENV=$PAPYRUS_ENV)" >&2
  exit 1
fi

read -r -p "This will DROP the local 'papyrus' database. Continue? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

PGUSER="${PGUSER:-papyrus}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"

psql -U "$PGUSER" -h "$PGHOST" -p "$PGPORT" -d postgres \
  -c "DROP DATABASE IF EXISTS papyrus WITH (FORCE);"
psql -U "$PGUSER" -h "$PGHOST" -p "$PGPORT" -d postgres \
  -c "CREATE DATABASE papyrus OWNER $PGUSER;"

uv run --package papyrus-api alembic -c apps/api/alembic.ini upgrade head
echo "==> Database reset complete."
