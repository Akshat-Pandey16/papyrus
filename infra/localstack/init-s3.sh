#!/usr/bin/env bash
set -euo pipefail

CORS='{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]}'

for bucket in papyrus-uploads papyrus-outputs; do
  awslocal s3 mb "s3://${bucket}" 2>/dev/null || true
  awslocal s3api put-bucket-cors --bucket "${bucket}" --cors-configuration "${CORS}" 2>/dev/null || true
done

echo "papyrus: LocalStack S3 buckets ready (papyrus-uploads, papyrus-outputs)"
