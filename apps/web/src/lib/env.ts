import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:8000"),
  VITE_APP_NAME: z.string().default("Papyrus"),
  VITE_SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(import.meta.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env: Env = parsed.data;
