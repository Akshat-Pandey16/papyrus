import { useAuthStore } from "@/features/auth/store";
import { formatBytes } from "@/features/pdf-compress/format";
import { env } from "@/lib/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function effectiveMaxFileBytes(): number {
  const user = useAuthStore.getState().user;
  const isAnon = user?.isAnonymous ?? true;
  return isAnon ? env.VITE_ANON_MAX_FILE_BYTES : env.VITE_MAX_FILE_BYTES;
}

function tooLargeMessage(max: number): string {
  const user = useAuthStore.getState().user;
  const isAnon = user?.isAnonymous ?? true;
  const base = `Too large — max ${formatBytes(max)}.`;
  return isAnon && env.VITE_MAX_FILE_BYTES > env.VITE_ANON_MAX_FILE_BYTES
    ? `${base} Sign in for files up to ${formatBytes(env.VITE_MAX_FILE_BYTES)}.`
    : base;
}

export function validatePdf(file: File): string | null {
  if (file.type !== "application/pdf") return "Only PDF files are supported.";
  if (file.size === 0) return "That file looks empty.";
  const max = effectiveMaxFileBytes();
  if (file.size > max) return tooLargeMessage(max);
  return null;
}

export function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG, or WebP images are supported.";
  if (file.size === 0) return "That image looks empty.";
  const max = effectiveMaxFileBytes();
  if (file.size > max) return tooLargeMessage(max);
  return null;
}

export function validateFor(accept: "pdf" | "image", file: File): string | null {
  return accept === "image" ? validateImage(file) : validatePdf(file);
}

export function maxFileLabel(): string {
  return formatBytes(effectiveMaxFileBytes());
}
