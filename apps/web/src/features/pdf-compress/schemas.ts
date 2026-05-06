import { z } from "zod";
import { env } from "@/lib/env";

export const compressionLevelSchema = z.enum(["low", "medium", "high"]);
export type CompressionLevelInput = z.infer<typeof compressionLevelSchema>;

export const compressFormSchema = z.object({
  file: z
    .instanceof(File, { message: "Please select a PDF file." })
    .refine((f) => f.type === "application/pdf", "Only PDF files are supported.")
    .refine(
      (f) => f.size <= env.VITE_MAX_FILE_BYTES,
      `File is too large (max ${(env.VITE_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB).`,
    ),
  level: compressionLevelSchema,
});

export type CompressFormInput = z.infer<typeof compressFormSchema>;
