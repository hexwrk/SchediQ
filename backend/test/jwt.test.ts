import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const SECRET = "t".repeat(48);

// env() reads process.env lazily on first use, so it must be populated before
// the jwt helpers are first called (each test file runs in its own process).
before(() => {
  Object.assign(process.env, {
    PORT: "4000",
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    JWT_SECRET: SECRET,
    CORS_ORIGIN: "http://localhost:3000",
    AI_PARSER: "rule",
  });
});

describe("JWT token version", () => {
  it("round-trips userId and tokenVersion", async () => {
    const { signToken, verifyToken } = await import("../src/lib/jwt");
    const t = signToken({ userId: "u1", tokenVersion: 3 });
    assert.deepEqual(verifyToken(t), { userId: "u1", tokenVersion: 3 });
  });

  it("reads a pre-revocation token (no tv claim) as version 0, so deploying logs nobody out", async () => {
    const { verifyToken } = await import("../src/lib/jwt");
    const legacy = jwt.sign({ userId: "u1" }, SECRET, { expiresIn: "1h" });
    assert.deepEqual(verifyToken(legacy), { userId: "u1", tokenVersion: 0 });
  });

  it("rejects a token signed with another algorithm or secret", async () => {
    const { verifyToken } = await import("../src/lib/jwt");
    const unsigned = jwt.sign({ userId: "u1", tv: 0 }, "", { algorithm: "none" });
    assert.throws(() => verifyToken(unsigned));
    assert.throws(() => verifyToken(jwt.sign({ userId: "u1", tv: 0 }, "x".repeat(48))));
  });
});
