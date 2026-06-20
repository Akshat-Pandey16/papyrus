import {
  Crop,
  Hash,
  ImagePlus,
  Images,
  Layers,
  ListOrdered,
  Lock,
  LockOpen,
  type LucideIcon,
  PencilLine,
  RotateCw,
  ScanLine,
  Scissors,
  Signature,
  SquareDashedBottom,
  Stamp,
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
  accept: "pdf" | "image";
  hue: string;
};

export const TOOL_ORDER: ToolId[] = [
  "compress",
  "merge",
  "split",
  "rotate",
  "reorder",
  "ocr",
  "protect",
  "unlock",
  "watermark",
  "page_numbers",
  "crop",
  "sign",
  "redact",
  "edit",
  "pdf_to_images",
  "images_to_pdf",
];

export const TOOLS: Record<ToolId, ToolMeta> = {
  compress: {
    id: "compress",
    label: "Compress",
    verb: "Compress",
    tagline: "Shrink the file, keep the quality",
    icon: Wand2,
    multi: false,
    accept: "pdf",
    hue: "44",
  },
  merge: {
    id: "merge",
    label: "Merge",
    verb: "Merge",
    tagline: "Combine PDFs into one tidy file",
    icon: Layers,
    multi: true,
    accept: "pdf",
    hue: "128",
  },
  split: {
    id: "split",
    label: "Split",
    verb: "Split",
    tagline: "Pull pages or chunk it up",
    icon: Scissors,
    multi: false,
    accept: "pdf",
    hue: "220",
  },
  rotate: {
    id: "rotate",
    label: "Rotate",
    verb: "Rotate",
    tagline: "Turn pages the right way up",
    icon: RotateCw,
    multi: false,
    accept: "pdf",
    hue: "80",
  },
  reorder: {
    id: "reorder",
    label: "Reorder",
    verb: "Reorder",
    tagline: "Rearrange the page order",
    icon: ListOrdered,
    multi: false,
    accept: "pdf",
    hue: "330",
  },
  ocr: {
    id: "ocr",
    label: "OCR",
    verb: "OCR",
    tagline: "Make scans searchable",
    icon: ScanLine,
    multi: false,
    accept: "pdf",
    hue: "190",
  },
  protect: {
    id: "protect",
    label: "Protect",
    verb: "Protect",
    tagline: "Lock it with a password",
    icon: Lock,
    multi: false,
    accept: "pdf",
    hue: "8",
  },
  unlock: {
    id: "unlock",
    label: "Unlock",
    verb: "Unlock",
    tagline: "Remove a known password",
    icon: LockOpen,
    multi: false,
    accept: "pdf",
    hue: "152",
  },
  watermark: {
    id: "watermark",
    label: "Watermark",
    verb: "Watermark",
    tagline: "Stamp text across every page",
    icon: Stamp,
    multi: false,
    accept: "pdf",
    hue: "260",
  },
  page_numbers: {
    id: "page_numbers",
    label: "Page numbers",
    verb: "Number",
    tagline: "Add page numbers anywhere",
    icon: Hash,
    multi: false,
    accept: "pdf",
    hue: "200",
  },
  crop: {
    id: "crop",
    label: "Crop",
    verb: "Crop",
    tagline: "Trim margins and whitespace",
    icon: Crop,
    multi: false,
    accept: "pdf",
    hue: "100",
  },
  sign: {
    id: "sign",
    label: "Sign",
    verb: "Sign",
    tagline: "Draw or type your signature",
    icon: Signature,
    multi: false,
    accept: "pdf",
    hue: "20",
  },
  redact: {
    id: "redact",
    label: "Redact",
    verb: "Redact",
    tagline: "Black out content for good",
    icon: SquareDashedBottom,
    multi: false,
    accept: "pdf",
    hue: "0",
  },
  edit: {
    id: "edit",
    label: "Edit",
    verb: "Edit",
    tagline: "Add text, shapes, and notes",
    icon: PencilLine,
    multi: false,
    accept: "pdf",
    hue: "300",
  },
  pdf_to_images: {
    id: "pdf_to_images",
    label: "PDF to images",
    verb: "Convert",
    tagline: "Export each page as JPG or PNG",
    icon: Images,
    multi: false,
    accept: "pdf",
    hue: "176",
  },
  images_to_pdf: {
    id: "images_to_pdf",
    label: "Images to PDF",
    verb: "Convert",
    tagline: "Turn photos into one PDF",
    icon: ImagePlus,
    multi: true,
    accept: "image",
    hue: "48",
  },
};

export const TOOL_PATH = {
  compress: "/tools/compress",
  merge: "/tools/merge",
  split: "/tools/split",
  rotate: "/tools/rotate",
  reorder: "/tools/reorder",
  ocr: "/tools/ocr",
  protect: "/tools/protect",
  unlock: "/tools/unlock",
  watermark: "/tools/watermark",
  page_numbers: "/tools/page-numbers",
  crop: "/tools/crop",
  sign: "/tools/sign",
  redact: "/tools/redact",
  edit: "/tools/edit",
  pdf_to_images: "/tools/pdf-to-images",
  images_to_pdf: "/tools/images-to-pdf",
} as const satisfies Record<ToolId, string>;

export function isToolId(value: string): value is ToolId {
  return value in TOOLS;
}

export type ToolCategory = "organize" | "optimize" | "convert" | "secure" | "edit";

export const TOOL_CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: "organize", label: "Organize" },
  { id: "optimize", label: "Optimize" },
  { id: "convert", label: "Convert" },
  { id: "secure", label: "Secure" },
  { id: "edit", label: "Edit & sign" },
];

export const TOOL_CATEGORY: Record<ToolId, ToolCategory> = {
  merge: "organize",
  split: "organize",
  rotate: "organize",
  reorder: "organize",
  compress: "optimize",
  ocr: "optimize",
  pdf_to_images: "convert",
  images_to_pdf: "convert",
  protect: "secure",
  unlock: "secure",
  redact: "secure",
  watermark: "edit",
  page_numbers: "edit",
  crop: "edit",
  sign: "edit",
  edit: "edit",
};

export function toolsInCategory(category: ToolCategory): ToolId[] {
  return TOOL_ORDER.filter((id) => TOOL_CATEGORY[id] === category);
}
