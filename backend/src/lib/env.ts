import { validate as validCron } from "node-cron";
import { z } from "zod";

// Typed, validated environment. index.ts calls loadEnv() before anything else
// at boot, so a missing or malformed variable stops the API with a clear list
// of problems instead of failing later on the first request that needs it.
//
// Modules read config through env() (not process.env) so every value has one
// definition, one default and one validation rule. env() parses lazily, which
// keeps pure modules (scheduler, mastery, ...) importable by the unit tests
// without a full environment.

// "true"/"false" (and 1/0, yes/no) from a string env var. z.coerce.boolean()
// is NOT used because Boolean("false") === true.
const boolFlag = (fallback: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return fallback;
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      ctx.addIssue({ code: "custom", message: "must be true or false" });
      return z.NEVER;
    });

// Empty strings in .env files ("OPENAI_API_KEY=") mean "not set".
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const postgresUrl = z
  .string({ message: "is required" })
  .trim()
  .min(1, "is required")
  .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgresql:// connection string");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Render injects PORT; 4000 locally.
  PORT: z
    .string({ message: "is required (Render injects it; use 4000 locally)" })
    .trim()
    .min(1, "is required (Render injects it; use 4000 locally)")
    .transform(Number)
    .pipe(z.number({ message: "must be a port number" }).int("must be a port number").min(1, "must be a port number").max(65535, "must be a port number")),
  DATABASE_URL: postgresUrl,
  // Neon: the direct (non-pooled) URL, used by `prisma migrate deploy` only.
  // Optional at runtime: the API itself always talks to DATABASE_URL.
  DIRECT_URL: optionalString,
  JWT_SECRET: z
    .string({ message: "is required" })
    .min(32, "is required and must be at least 32 characters (generate one with: openssl rand -base64 48)"),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("7d"),
  // Comma-separated allowlist of browser origins. "*" is refused: the API
  // takes bearer tokens and must only answer the real frontend.
  CORS_ORIGIN: z
    .string({ message: "is required (comma-separated frontend origins)" })
    .trim()
    .min(1, "is required (comma-separated frontend origins)")
    .transform((raw, ctx) => {
      const origins = raw
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean);
      for (const o of origins) {
        if (o === "*") {
          ctx.addIssue({ code: "custom", message: 'must list explicit origins, "*" is not allowed' });
          return z.NEVER;
        }
        let url: URL;
        try {
          url = new URL(o);
        } catch {
          ctx.addIssue({ code: "custom", message: `"${o}" is not a valid origin like https://app.example.com` });
          return z.NEVER;
        }
        if (url.origin !== o) {
          ctx.addIssue({ code: "custom", message: `"${o}" must be a bare origin (scheme://host[:port], no path)` });
          return z.NEVER;
        }
      }
      return origins;
    }),
  AI_PARSER: z.enum(["rule", "openai"], { message: 'is required: "rule" (offline) or "openai"' }),
  OPENAI_API_KEY: optionalString,
  // Shows reset links in the API response, enables UI backups. Never in prod.
  DEMO_MODE: boolFlag(false),
  // Frontend origin used to build password reset links. Defaults to the
  // first CORS origin.
  APP_URL: optionalString,
  BACKUP_MODE: z.enum(["auto", "json"]).default("auto"),
  PG_DUMP_PATH: optionalString,
  PSQL_PATH: optionalString,
  // Off-site backup to S3-compatible object storage (Cloudflare R2, Backblaze
  // B2, AWS S3, MinIO). All five are needed; with any missing, cloud backup is
  // simply off (see storageConfigured). The secret key is never logged or
  // returned by the API.
  S3_ENDPOINT: optionalString.refine((v) => v === undefined || /^https?:\/\//.test(v), "must be an http(s):// URL"),
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  // Automatic cloud backup: "daily" (03:00 server time) or a cron expression
  // such as "0 */6 * * *". Unset = manual only.
  BACKUP_SCHEDULE: optionalString.refine(
    (v) => v === undefined || v.toLowerCase() === "daily" || validCron(v),
    'must be "daily" or a valid cron expression, e.g. "0 3 * * *"'
  ),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {}

// Messages name the variable and the rule, never the value (it may be a secret).
// The cross-field rule is checked on the raw input, not as a schema
// refinement, because zod skips refinements once any field has failed and
// every problem should be reported in one go.
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse(source);
  const problems = result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join(".") || "(env)"} ${i.message}`);
  if (source.AI_PARSER?.trim() === "openai" && !source.OPENAI_API_KEY?.trim()) {
    problems.push("OPENAI_API_KEY is required when AI_PARSER=openai");
  }
  if (!result.success || problems.length > 0) {
    throw new EnvError(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return result.data;
}

let cached: Env | null = null;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

// Boot-time check. Prints every problem at once and exits non-zero so Render
// marks the deploy as failed instead of serving a half-configured API.
export function loadEnv(): Env {
  try {
    const e = env();
    if (e.NODE_ENV === "production" && e.DEMO_MODE) {
      console.warn("WARNING: DEMO_MODE=true in production exposes password reset links. Set DEMO_MODE=false.");
    }
    return e;
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// True only when every value object storage needs is present. A half-filled
// set is treated as "not configured", never an error, so the rest of the API
// boots normally.
export function storageConfigured(e: Env = env()): boolean {
  return !!(e.S3_ENDPOINT && e.S3_REGION && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
}

export function appUrl(): string {
  const e = env();
  return (e.APP_URL ?? e.CORS_ORIGIN[0]).replace(/\/$/, "");
}
