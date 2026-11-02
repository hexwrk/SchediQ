import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnvError, parseEnv, storageConfigured } from "../src/lib/env";
import { DAILY_CRON, scheduleExpression } from "../src/lib/backupSchedule";
import { BACKUP_PREFIX, PRESIGN_TTL_SECONDS, logStorageFailure, storageErrorMessage } from "../src/lib/objectStorage";
import { logAiFailure } from "../src/lib/openai";
import { temporaryPassword } from "../src/controllers/admin.controller";
import { validatePassword } from "../../shared/validation";

// A minimal valid production-like environment; each test breaks one thing.
const base = {
  NODE_ENV: "production",
  PORT: "10000",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL: "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  JWT_SECRET: "x".repeat(48),
  CORS_ORIGIN: "https://schediq.vercel.app, https://schediq.example.com/",
  AI_PARSER: "openai",
  OPENAI_API_KEY: "sk-test",
};

const failsWith = (env: Record<string, string | undefined>, pattern: RegExp) =>
  assert.throws(() => parseEnv(env), (err: unknown) => err instanceof EnvError && pattern.test(err.message));

describe("env validation", () => {
  it("accepts a complete production config and normalises it", () => {
    const e = parseEnv(base);
    assert.equal(e.PORT, 10000);
    assert.deepEqual(e.CORS_ORIGIN, ["https://schediq.vercel.app", "https://schediq.example.com"]);
    assert.equal(e.DEMO_MODE, false, "DEMO_MODE defaults to false");
    assert.equal(e.JWT_EXPIRES_IN, "7d");
  });

  it("fails fast on a missing or short JWT_SECRET", () => {
    failsWith({ ...base, JWT_SECRET: undefined }, /JWT_SECRET/);
    failsWith({ ...base, JWT_SECRET: "short" }, /JWT_SECRET .*32 characters/);
  });

  it("requires DATABASE_URL, CORS_ORIGIN, PORT and AI_PARSER", () => {
    for (const key of ["DATABASE_URL", "CORS_ORIGIN", "PORT", "AI_PARSER"]) {
      failsWith({ ...base, [key]: undefined }, new RegExp(key));
    }
  });

  it("requires OPENAI_API_KEY only when AI_PARSER=openai, and reports it with other errors", () => {
    failsWith({ ...base, OPENAI_API_KEY: "" }, /OPENAI_API_KEY is required/);
    assert.doesNotThrow(() => parseEnv({ ...base, AI_PARSER: "rule", OPENAI_API_KEY: "" }));
    failsWith({ ...base, OPENAI_API_KEY: "", JWT_SECRET: "short" }, /JWT_SECRET[\s\S]*OPENAI_API_KEY/);
  });

  it('rejects "*" and non-origin values in CORS_ORIGIN', () => {
    failsWith({ ...base, CORS_ORIGIN: "*" }, /not allowed/);
    failsWith({ ...base, CORS_ORIGIN: "https://a.vercel.app/app" }, /bare origin/);
    failsWith({ ...base, CORS_ORIGIN: "not a url" }, /valid origin/);
  });

  it("parses DEMO_MODE strictly (no Boolean('false') trap)", () => {
    assert.equal(parseEnv({ ...base, DEMO_MODE: "false" }).DEMO_MODE, false);
    assert.equal(parseEnv({ ...base, DEMO_MODE: "true" }).DEMO_MODE, true);
    failsWith({ ...base, DEMO_MODE: "maybe" }, /DEMO_MODE/);
  });

  it("never echoes secret values in the error message", () => {
    const secret = "sk-supersecretvalue-should-not-appear";
    try {
      parseEnv({ ...base, JWT_SECRET: "tooshort", OPENAI_API_KEY: secret, DATABASE_URL: "mysql://root:hunter2@x/db" });
      assert.fail("expected EnvError");
    } catch (err) {
      const msg = (err as Error).message;
      assert.ok(!msg.includes("tooshort") && !msg.includes(secret) && !msg.includes("hunter2"), msg);
    }
  });
});

describe("AI failure logging", () => {
  it("logs status and code but redacts anything shaped like an API key", () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      logAiFailure("task parse", {
        name: "AuthenticationError",
        status: 401,
        code: "invalid_api_key",
        message: "401 Incorrect API key provided: sk-proj-********************abcd. You can find your API key at ...",
      });
    } finally {
      console.error = original;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /status=401 code=invalid_api_key/);
    assert.match(lines[0], /sk-\[redacted\]/);
    assert.ok(!lines[0].includes("abcd"), lines[0]);
  });
});

describe("admin temporary password", () => {
  it("meets the shared password rule, is unambiguous and is unique per call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pw = temporaryPassword();
      assert.equal(validatePassword(pw), null, pw);
      assert.match(pw, /^[a-hjkmnp-zA-HJ-NP-Z2-9]{4}(-[a-hjkmnp-zA-HJ-NP-Z2-9]{4}){3}$/);
      seen.add(pw);
    }
    assert.equal(seen.size, 200);
  });
});

describe("Cloud (S3-compatible) backup config", () => {
  const s3 = {
    S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
    S3_REGION: "auto",
    S3_BUCKET: "schediq-backups",
    S3_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
    S3_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };
  it("is configured only when all five values are set", () => {
    assert.equal(storageConfigured(parseEnv(base)), false);
    assert.equal(storageConfigured(parseEnv({ ...base, ...s3 })), true);
    for (const key of Object.keys(s3)) {
      assert.equal(storageConfigured(parseEnv({ ...base, ...s3, [key]: "" })), false, key);
    }
  });
  it("rejects an S3_ENDPOINT that is not a URL", () => {
    failsWith({ ...base, ...s3, S3_ENDPOINT: "r2.cloudflarestorage.com" }, /S3_ENDPOINT/);
  });
  it("stores under backups/ with a ~1 hour download link", () => {
    assert.equal(BACKUP_PREFIX, "backups/");
    assert.equal(PRESIGN_TTL_SECONDS, 3600);
  });
  it("validates BACKUP_SCHEDULE as daily or a cron expression", () => {
    assert.equal(parseEnv({ ...base, BACKUP_SCHEDULE: "daily" }).BACKUP_SCHEDULE, "daily");
    assert.doesNotThrow(() => parseEnv({ ...base, BACKUP_SCHEDULE: "0 */6 * * *" }));
    failsWith({ ...base, BACKUP_SCHEDULE: "every tuesday" }, /BACKUP_SCHEDULE/);
    assert.equal(scheduleExpression("Daily"), DAILY_CRON);
    assert.equal(scheduleExpression(" 0 1 * * * "), "0 1 * * *");
  });
  it("maps provider errors to actionable messages without echoing them", () => {
    assert.match(storageErrorMessage({ name: "InvalidAccessKeyId", $metadata: { httpStatusCode: 403 } }), /access key/);
    assert.match(storageErrorMessage({ name: "SignatureDoesNotMatch" }), /access key/);
    assert.match(storageErrorMessage({ name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } }), /S3_BUCKET/);
    assert.match(storageErrorMessage({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } }), /403/);
    assert.match(storageErrorMessage({ $metadata: { httpStatusCode: 503 } }), /unavailable/);
  });
  it("never logs keys or signatures", () => {
    const lines: string[] = [];
    const original = console.error;
    const originalSecret = process.env.S3_SECRET_ACCESS_KEY;
    process.env.S3_SECRET_ACCESS_KEY = s3.S3_SECRET_ACCESS_KEY;
    console.error = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      logStorageFailure("upload", {
        name: "SignatureDoesNotMatch",
        $metadata: { httpStatusCode: 403 },
        message: `AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261102/auto/s3/aws4_request, Signature=deadbeef01 key ${s3.S3_SECRET_ACCESS_KEY}`,
      });
    } finally {
      console.error = original;
      if (originalSecret === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
      else process.env.S3_SECRET_ACCESS_KEY = originalSecret;
    }
    assert.equal(lines.length, 1);
    for (const leak of ["AKIAIOSFODNN7EXAMPLE", "deadbeef01", s3.S3_SECRET_ACCESS_KEY]) assert.ok(!lines[0].includes(leak), lines[0]);
    assert.match(lines[0], /status=403/);
  });
});
