import { formatBytes } from "@/features/pdf-compress/format";
import { env } from "@/lib/env";

export function validatePdf(file: File): string | null {
  if (file.type !== "application/pdf") return "Only PDF files are supported.";
  if (file.size === 0) return "That file looks empty.";
  if (file.size > env.VITE_MAX_FILE_BYTES) {
    return `Too large — max ${formatBytes(env.VITE_MAX_FILE_BYTES)}.`;
  }
  return null;
}

export function maxFileLabel(): string {
  return formatBytes(env.VITE_MAX_FILE_BYTES);
}
