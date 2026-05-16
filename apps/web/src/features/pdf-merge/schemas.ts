import { z } from "zod";
import { compressionOptionsSchema, pdfVersionSchema } from "@/features/pdf-compress/schemas";
import { env } from "@/lib/env";

export const mergeFileSchema = z
  .instanceof(File, { message: "Please select a PDF file." })
  .refine((f) => f.type === "application/pdf", "Only PDF files are supported.")
  .refine(
    (f) => f.size <= env.VITE_MAX_FILE_BYTES,
    `File is too large (max ${(env.VITE_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB).`,
  );

export const mergeOptionsSchema = z.object({
  addFilenameBookmarks: z.boolean(),
  blankPagesBetween: z.number().int().min(0).max(2),
  stripMetadata: z.boolean(),
  linearize: z.boolean(),
  pdfVersion: pdfVersionSchema.nullable(),
  compress: compressionOptionsSchema.nullable(),
});

export const mergeFormSchema = z.object({
  files: z.array(mergeFileSchema).min(2, "Add at least two PDFs to merge.").max(50),
  options: mergeOptionsSchema.optional(),
});

export type MergeFormInput = z.infer<typeof mergeFormSchema>;
