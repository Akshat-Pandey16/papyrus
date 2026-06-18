import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default(import.meta.env.DEV ? "http://localhost:8000" : ""),
  VITE_APP_NAME: z.string().default("Papyrus"),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_MAX_FILE_BYTES: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number.parseInt(v, 10) : v))
    .pipe(z.number().int().positive())
    .default(500 * 1024 * 1024),
});

export type Env = z.infer<typeof EnvSchema>;

function runtimeConfig(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const raw = (window as { __PAPYRUS_CONFIG__?: Record<string, unknown> }).__PAPYRUS_CONFIG__;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

const parsed = EnvSchema.safeParse({ ...import.meta.env, ...runtimeConfig() });
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env: Env = parsed.data;
