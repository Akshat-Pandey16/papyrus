const MESSAGES: Record<string, string> = {
  pdf_encrypted: "This PDF is password-protected. Remove the password and try again.",
  pdf_malformed: "This PDF appears to be damaged. Re-export it and upload again.",
  pdf_signature_invalid: "That file isn't a valid PDF.",
  upload_not_found_in_storage: "The upload didn't reach our storage. Try uploading again.",
  upload_already_confirmed: "This file was already processed. Start a new job.",
  ocr_not_configured: "OCR isn't available on this server right now.",
  quota_exceeded: "You've reached your limit. Sign up for more, or try again later.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  document_not_found: "We couldn't find that file. Upload it again.",
  job_not_found: "We couldn't find that job. Try starting over.",
  job_output_expired: "This result has expired. Run the tool again to get a fresh download.",
  job_not_terminal: "This job hasn't finished yet.",
  validation_error: "Some of the details weren't valid. Check your input and try again.",
  unauthenticated: "Your session expired. Refresh the page and try again.",
  forbidden: "You don't have access to do that.",
  csrf_failed: "Your session looks stale. Refresh the page and try again.",
  job_timeout: "That took too long to process. Try a smaller file.",
  network_error: "Network problem. Check your connection and try again.",
  timeout: "That took too long. Try a smaller file.",
  aborted: "The request was cancelled.",
  cancelled: "Cancelled.",
  upload_failed: "The upload didn't finish. Please try again.",
  internal_error: "Something went wrong on our end. Please try again.",
};

export function mapErrorMessage(code?: string | null, fallback?: string | null): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  const trimmed = fallback?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Something went wrong. Please try again.";
}
