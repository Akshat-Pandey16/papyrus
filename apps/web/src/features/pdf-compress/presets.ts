import type { CompressionLevel, CompressionOptions } from "@/features/pdf-compress/types";

export const PRESET_OPTIONS: Record<Exclude<CompressionLevel, "custom">, CompressionOptions> = {
  low: {
    engine: "pikepdf",
    pdfVersion: null,
    recompressImages: false,
    imageQuality: 90,
    imageMaxDimension: null,
    colorMode: "preserve",
    recompressStreams: true,
    objectStreamMode: "preserve",
    stripMetadata: false,
    discardJavascript: false,
    discardForms: false,
    discardAnnotations: false,
    discardBookmarks: false,
    discardAttachments: false,
    discardThumbnails: false,
    linearize: false,
  },
  medium: {
    engine: "pikepdf",
    pdfVersion: null,
    recompressImages: true,
    imageQuality: 82,
    imageMaxDimension: 2400,
    colorMode: "preserve",
    recompressStreams: true,
    objectStreamMode: "generate",
    stripMetadata: false,
    discardJavascript: false,
    discardForms: false,
    discardAnnotations: false,
    discardBookmarks: false,
    discardAttachments: false,
    discardThumbnails: false,
    linearize: false,
  },
  high: {
    engine: "pikepdf",
    pdfVersion: null,
    recompressImages: true,
    imageQuality: 72,
    imageMaxDimension: 1600,
    colorMode: "preserve",
    recompressStreams: true,
    objectStreamMode: "generate",
    stripMetadata: true,
    discardJavascript: false,
    discardForms: false,
    discardAnnotations: false,
    discardBookmarks: false,
    discardAttachments: false,
    discardThumbnails: true,
    linearize: false,
  },
  extreme: {
    engine: "ghostscript",
    pdfVersion: "1.6",
    recompressImages: true,
    imageQuality: 55,
    imageMaxDimension: 1100,
    colorMode: "grayscale",
    recompressStreams: true,
    objectStreamMode: "generate",
    stripMetadata: true,
    discardJavascript: true,
    discardForms: false,
    discardAnnotations: false,
    discardBookmarks: false,
    discardAttachments: true,
    discardThumbnails: true,
    linearize: false,
  },
};

export const DEFAULT_LEVEL: CompressionLevel = "medium";

export function optionsForLevel(level: CompressionLevel): CompressionOptions {
  if (level === "custom") return PRESET_OPTIONS.medium;
  return PRESET_OPTIONS[level];
}

export function isMatchingPreset(
  options: CompressionOptions,
  level: Exclude<CompressionLevel, "custom">,
): boolean {
  const preset = PRESET_OPTIONS[level];
  return (
    options.engine === preset.engine &&
    options.pdfVersion === preset.pdfVersion &&
    options.recompressImages === preset.recompressImages &&
    options.imageQuality === preset.imageQuality &&
    options.imageMaxDimension === preset.imageMaxDimension &&
    options.colorMode === preset.colorMode &&
    options.recompressStreams === preset.recompressStreams &&
    options.objectStreamMode === preset.objectStreamMode &&
    options.stripMetadata === preset.stripMetadata &&
    options.discardJavascript === preset.discardJavascript &&
    options.discardForms === preset.discardForms &&
    options.discardAnnotations === preset.discardAnnotations &&
    options.discardBookmarks === preset.discardBookmarks &&
    options.discardAttachments === preset.discardAttachments &&
    options.discardThumbnails === preset.discardThumbnails &&
    options.linearize === preset.linearize
  );
}

export function detectLevel(options: CompressionOptions): CompressionLevel {
  for (const candidate of ["low", "medium", "high", "extreme"] as const) {
    if (isMatchingPreset(options, candidate)) return candidate;
  }
  return "custom";
}
