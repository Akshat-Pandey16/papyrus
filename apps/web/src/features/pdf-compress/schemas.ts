import { z } from "zod";
import { env } from "@/lib/env";

export const compressionLevelSchema = z.enum(["low", "medium", "high", "extreme", "custom"]);
export type CompressionLevelInput = z.infer<typeof compressionLevelSchema>;

export const colorModeSchema = z.enum(["preserve", "grayscale"]);
export const objectStreamModeSchema = z.enum(["preserve", "generate", "disable"]);
export const compressionEngineSchema = z.enum(["pikepdf", "ghostscript"]);
export const pdfVersionSchema = z.enum(["1.4", "1.5", "1.6", "1.7"]);

export const compressionOptionsSchema = z.object({
  engine: compressionEngineSchema,
  recompressImages: z.boolean(),
  imageQuality: z.number().int().min(1).max(100),
  imageMaxDimension: z.number().int().min(0).max(8000).nullable(),
  colorMode: colorModeSchema,
  recompressStreams: z.boolean(),
  objectStreamMode: objectStreamModeSchema,
  stripMetadata: z.boolean(),
  discardJavascript: z.boolean(),
  discardForms: z.boolean(),
  discardAnnotations: z.boolean(),
  discardBookmarks: z.boolean(),
  discardAttachments: z.boolean(),
  discardThumbnails: z.boolean(),
  linearize: z.boolean(),
  pdfVersion: pdfVersionSchema.nullable(),
});

export const compressFormSchema = z.object({
  file: z
    .instanceof(File, { message: "Please select a PDF file." })
    .refine((f) => f.type === "application/pdf", "Only PDF files are supported.")
    .refine(
      (f) => f.size <= env.VITE_MAX_FILE_BYTES,
      `File is too large (max ${(env.VITE_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB).`,
    ),
  level: compressionLevelSchema,
  options: compressionOptionsSchema.optional(),
});

export type CompressFormInput = z.infer<typeof compressFormSchema>;
