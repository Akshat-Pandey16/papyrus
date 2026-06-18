#!/usr/bin/env bash
set -euo pipefail

S3_CORS_ALLOWED_ORIGINS="${S3_CORS_ALLOWED_ORIGINS:-http://localhost:5173}"
IFS=',' read -ra ORIGINS <<< "${S3_CORS_ALLOWED_ORIGINS}"
ORIGINS_JSON=$(printf '"%s",' "${ORIGINS[@]}")
ORIGINS_JSON="[${ORIGINS_JSON%,}]"
CORS="{\"CORSRules\":[{\"AllowedOrigins\":${ORIGINS_JSON},\"AllowedMethods\":[\"GET\",\"PUT\",\"POST\",\"HEAD\"],\"AllowedHeaders\":[\"*\"],\"ExposeHeaders\":[\"ETag\"]}]}"

for bucket in papyrus-uploads papyrus-outputs; do
  awslocal s3 mb "s3://${bucket}" 2>/dev/null || true
  awslocal s3api put-bucket-cors --bucket "${bucket}" --cors-configuration "${CORS}" 2>/dev/null || true
done

echo "papyrus: LocalStack S3 buckets ready (papyrus-uploads, papyrus-outputs)"
