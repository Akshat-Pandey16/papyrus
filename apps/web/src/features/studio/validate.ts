import { useAuthStore } from "@/features/auth/store";
import type { UploadContentType } from "@/features/pdf-compress/api";
import { formatBytes } from "@/features/pdf-compress/format";
import { env } from "@/lib/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const OFFICE_TYPE_BY_EXT: Record<string, UploadContentType> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

const OFFICE_TYPES = new Set<string>(Object.values(OFFICE_TYPE_BY_EXT));

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function officeContentType(file: File): UploadContentType | null {
  const byExt = OFFICE_TYPE_BY_EXT[extOf(file.name)];
  if (byExt) return byExt;
  if (OFFICE_TYPES.has(file.type)) return file.type as UploadContentType;
  return null;
}

export function validateOffice(file: File): string | null {
  if (officeContentType(file) == null) {
    return "Upload a Word, Excel, PowerPoint, or OpenDocument file.";
  }
  if (file.size === 0) return "That file looks empty.";
  const max = effectiveMaxFileBytes();
  if (file.size > max) return tooLargeMessage(max);
  return null;
}

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

export function validateFor(accept: "pdf" | "image" | "office", file: File): string | null {
  if (accept === "image") return validateImage(file);
  if (accept === "office") return validateOffice(file);
  return validatePdf(file);
}

export function maxFileLabel(): string {
  return formatBytes(effectiveMaxFileBytes());
}
