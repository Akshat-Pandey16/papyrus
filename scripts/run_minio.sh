#!/usr/bin/env bash
set -euo pipefail
export MINIO_ROOT_USER="papyrus"
export MINIO_ROOT_PASSWORD="papyrus-secret"
exec "/home/intozi/.local/bin/minio" server "/home/intozi/.local/share/minio" --console-address ":9001"
