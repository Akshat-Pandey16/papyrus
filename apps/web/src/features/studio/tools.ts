import {
  Layers,
  ListOrdered,
  type LucideIcon,
  RotateCw,
  ScanLine,
  Scissors,
  Wand2,
} from "lucide-react";
import type { ToolId } from "@/features/studio/types";

export type ToolMeta = {
  id: ToolId;
  label: string;
  verb: string;
  tagline: string;
  icon: LucideIcon;
  multi: boolean;
  hue: string;
};

export const TOOL_ORDER: ToolId[] = ["compress", "merge", "split", "rotate", "reorder", "ocr"];

export const TOOLS: Record<ToolId, ToolMeta> = {
  compress: {
    id: "compress",
    label: "Compress",
    verb: "Compress",
    tagline: "Shrink the file, keep the quality",
    icon: Wand2,
    multi: false,
    hue: "44",
  },
  merge: {
    id: "merge",
    label: "Merge",
    verb: "Merge",
    tagline: "Combine PDFs into one tidy file",
    icon: Layers,
    multi: true,
    hue: "128",
  },
  split: {
    id: "split",
    label: "Split",
    verb: "Split",
    tagline: "Pull pages or chunk it up",
    icon: Scissors,
    multi: false,
    hue: "220",
  },
  rotate: {
    id: "rotate",
    label: "Rotate",
    verb: "Rotate",
    tagline: "Turn pages the right way up",
    icon: RotateCw,
    multi: false,
    hue: "80",
  },
  reorder: {
    id: "reorder",
    label: "Reorder",
    verb: "Reorder",
    tagline: "Rearrange the page order",
    icon: ListOrdered,
    multi: false,
    hue: "330",
  },
  ocr: {
    id: "ocr",
    label: "OCR",
    verb: "OCR",
    tagline: "Make scans searchable",
    icon: ScanLine,
    multi: false,
    hue: "190",
  },
};

export const TOOL_PATH = {
  compress: "/tools/compress",
  merge: "/tools/merge",
  split: "/tools/split",
  rotate: "/tools/rotate",
  reorder: "/tools/reorder",
  ocr: "/tools/ocr",
} as const satisfies Record<ToolId, string>;

export function isToolId(value: string): value is ToolId {
  return value in TOOLS;
}
