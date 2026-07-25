import { z } from "zod";

/**
 * Runtime config. Every integration that needs a credential is optional here on
 * purpose: the app is meant to run end-to-end with none of them set, and each
 * feature checks its own flag before assuming a client exists. Promote a var
 * from `.optional()` to required only once that phase actually ships.
 */
/**
 * `.env` files can't express "absent" — an unfilled key reads as "". Treat
 * empty strings as undefined so a blank placeholder means "not configured"
 * rather than "configured with an invalid value".
 */
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional()
);

const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().url().optional()
);

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Phase: persistence.
  // Not z.string().url() — mongodb+srv:// is not a URL the WHATWG parser
  // accepts, and validating the scheme is the check that actually matters.
  MONGODB_URI: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .refine(
        (v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"),
        "Must start with mongodb:// or mongodb+srv://"
      )
      .optional()
  ),
  MONGODB_DB: optionalString,

  // Phase: authentication
  AUTH_SECRET: optionalString,
  AUTH_URL: optionalUrl,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Phase: notifications
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional()
  ),

  /**
   * Phase: AI insights.
   *
   * Any OpenAI-compatible /chat/completions endpoint. That shape is the de
   * facto standard for serving open-weight models, so the same client works
   * against Ollama locally (no key, no cost) and a hosted free tier such as
   * Groq or OpenRouter in production, where a local model can't run.
   */
  AI_BASE_URL: optionalUrl,
  AI_MODEL: optionalString,
  /** Optional: Ollama and other local servers need no key. */
  AI_API_KEY: optionalString,

  // Phase: storage + observability
  BLOB_READ_WRITE_TOKEN: optionalString,
  SENTRY_DSN: optionalUrl,
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
  // No API key in the condition on purpose — a local Ollama server needs none.
  aiInsights: Boolean(env.AI_BASE_URL && env.AI_MODEL),
  blobStorage: Boolean(env.BLOB_READ_WRITE_TOKEN),
  errorReporting: Boolean(env.SENTRY_DSN),
} as const;

export type FeatureFlag = keyof typeof features;
