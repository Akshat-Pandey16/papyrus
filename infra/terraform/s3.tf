variable "bucket_prefix" {
  type    = string
  default = "papyrus"
}

variable "app_origins" {
  type        = list(string)
  description = "Browser origins allowed to PUT presigned uploads / GET presigned downloads."
}

locals {
  buckets = {
    uploads = "${var.bucket_prefix}-uploads"
    outputs = "${var.bucket_prefix}-outputs"
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  bucket   = each.value
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_cors_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.app_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    id     = "purge-artifacts"
    status = "Enabled"
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
