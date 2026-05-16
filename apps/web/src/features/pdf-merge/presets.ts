import type { MergeOptions } from "@/features/pdf-merge/types";

export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  addFilenameBookmarks: false,
  blankPagesBetween: 0,
  stripMetadata: false,
  linearize: false,
  pdfVersion: null,
  compress: null,
};

const PAGE_RANGE_RE = /^(\s*\d+(\s*-\s*\d+)?\s*)(,\s*\d+(\s*-\s*\d+)?\s*)*$/;

export function isValidPageRangeSpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (trimmed === "") return true;
  if (trimmed.length > 512) return false;
  return PAGE_RANGE_RE.test(trimmed);
}
