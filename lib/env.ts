import { z } from "zod";

/**
 * Runtime config. Every integration that needs a credential is optional here on
 * purpose: the app is meant to run end-to-end with none of them set, and each
 * feature checks its own flag before assuming a client exists. Promote a var
 * from `.optional()` to required only once that phase actually ships.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Phase: persistence
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DB: z.string().optional(),

  // Phase: authentication
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Phase: notifications
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Phase: AI insights
  ANTHROPIC_API_KEY: z.string().optional(),

  // Phase: storage + observability
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  console.warn(
    "[fintrack] Invalid environment variables:",
    parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
  );
}

export const env = parsed.success ? parsed.data : serverSchema.parse({});

/**
 * Feature switches derived from configuration. Import these rather than reading
 * `env` directly so the "is this wired up yet?" logic lives in one place.
 */
export const features = {
  database: Boolean(env.MONGODB_URI),
  auth: Boolean(env.AUTH_SECRET && env.MONGODB_URI),
  oauthGoogle: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  aiInsights: Boolean(env.ANTHROPIC_API_KEY),
  blobStorage: Boolean(env.BLOB_READ_WRITE_TOKEN),
  errorReporting: Boolean(env.SENTRY_DSN),
} as const;

export type FeatureFlag = keyof typeof features;
