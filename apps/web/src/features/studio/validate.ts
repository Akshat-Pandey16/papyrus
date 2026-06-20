import { formatBytes } from "@/features/pdf-compress/format";
import { env } from "@/lib/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validatePdf(file: File): string | null {
  if (file.type !== "application/pdf") return "Only PDF files are supported.";
  if (file.size === 0) return "That file looks empty.";
  if (file.size > env.VITE_MAX_FILE_BYTES) {
    return `Too large — max ${formatBytes(env.VITE_MAX_FILE_BYTES)}.`;
  }
  return null;
}

export function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG, or WebP images are supported.";
  if (file.size === 0) return "That image looks empty.";
  if (file.size > env.VITE_MAX_FILE_BYTES) {
    return `Too large — max ${formatBytes(env.VITE_MAX_FILE_BYTES)}.`;
  }
  return null;
}

export function validateFor(accept: "pdf" | "image", file: File): string | null {
  return accept === "image" ? validateImage(file) : validatePdf(file);
}

export function maxFileLabel(): string {
  return formatBytes(env.VITE_MAX_FILE_BYTES);
}
