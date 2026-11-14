import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tierLimit } from "../src/lib/tier";
import { parseEnv } from "../src/lib/env";
import { FREE_AI_PARSES_PER_DAY, FREE_COURSE_LIMIT, TIER_LIMITS_ENABLED } from "../../shared/validation";

const base = {
  NODE_ENV: "test",
  PORT: "4000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/schediq",
  DIRECT_URL: "postgresql://u:p@localhost:5432/schediq",
  JWT_SECRET: "x".repeat(48),
  CORS_ORIGIN: "http://localhost:3000",
  AI_PARSER: "rule",
};

describe("tier limits (demo: Free includes everything)", () => {
  it("has the cap switch off, so no account is ever gated", () => {
    assert.equal(TIER_LIMITS_ENABLED, false);
  });
  it("gives FREE unlimited AI parses and courses (no 402 possible)", () => {
    assert.equal(tierLimit("FREE", FREE_AI_PARSES_PER_DAY), null);
    assert.equal(tierLimit("FREE", FREE_COURSE_LIMIT), null);
    assert.equal(tierLimit("PREMIUM", FREE_COURSE_LIMIT), null);
  });
  it("still caps FREE (and only FREE) when the switch is turned back on", () => {
    assert.equal(tierLimit("FREE", FREE_AI_PARSES_PER_DAY, true), FREE_AI_PARSES_PER_DAY);
    assert.equal(tierLimit("FREE", FREE_COURSE_LIMIT, true), FREE_COURSE_LIMIT);
    assert.equal(tierLimit("PREMIUM", FREE_COURSE_LIMIT, true), null);
  });
});

describe("AI rate limit (abuse guard, env-configurable)", () => {
  it("defaults to a generous 200 per hour", () => {
    assert.equal(parseEnv(base).AI_RATE_LIMIT_PER_HOUR, 200);
    assert.equal(parseEnv({ ...base, AI_RATE_LIMIT_PER_HOUR: "" }).AI_RATE_LIMIT_PER_HOUR, 200);
  });
  it("reads AI_RATE_LIMIT_PER_HOUR and rejects nonsense", () => {
    assert.equal(parseEnv({ ...base, AI_RATE_LIMIT_PER_HOUR: "500" }).AI_RATE_LIMIT_PER_HOUR, 500);
    for (const bad of ["0", "-5", "abc", "1.5"]) {
      assert.throws(() => parseEnv({ ...base, AI_RATE_LIMIT_PER_HOUR: bad }), /AI_RATE_LIMIT_PER_HOUR/, bad);
    }
  });
});
