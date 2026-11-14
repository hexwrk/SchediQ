import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";

// Controller-level checks against a REAL Postgres (the docker-compose one
// locally). They cover the invariants that only exist at the database layer:
// regenerate keeps completed sessions, every write is scoped to its user, and
// an OpenAI failure degrades to the rule parser instead of failing the request.
//
// Safety: each run creates its own throwaway users (random emails) and deletes
// them afterwards; every child row cascades. If no database is reachable the
// tests skip instead of failing, so the pure unit suite still runs anywhere.

// env() is parsed once per process (each test file runs in its own process),
// so the OpenAI path is configured here, before any module reads it. The base
// URL points at a closed local port: the SDK fails on connect, with no network
// traffic, which is exactly the "model unavailable" case.
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: process.env.PORT || "4000",
  CORS_ORIGIN: "http://localhost:3000",
  AI_PARSER: "openai",
  OPENAI_API_KEY: "sk-test-not-a-real-key",
  OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
  JWT_SECRET: process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : "i".repeat(48),
});

// Loaded lazily so the env above is in place first.
type Prisma = typeof import("../src/lib/prisma")["prisma"];
let prisma: Prisma;
let dbUp = false;
const created: string[] = [];

interface FakeRes {
  statusCode: number;
  body: any;
}

// Minimal Express Response: the handlers only call status() and json().
function fakeRes(): FakeRes & Response {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res as unknown as FakeRes & Response;
}

const fakeReq = (userId: string, body: unknown = {}) => ({ userId, body, params: {} }) as unknown as Request;

async function makeUser(): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { email: `it-${tag}@example.com`, username: `it_${tag}`, passwordHash: "x", name: "Integration test" },
  });
  created.push(user.id);
  return user.id;
}

const day = (offset: number, h: number, m = 0) => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset, h, m, 0, 0);
};

before(async () => {
  if (!process.env.DATABASE_URL) return;
  ({ prisma } = await import("../src/lib/prisma"));
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }
});

after(async () => {
  if (!dbUp) return;
  // Cascades remove tasks, sessions, preferences and AI parse logs.
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("regenerate schedule (POST /api/sessions/generate)", () => {
  it("keeps completed sessions, replaces only planned ones, and plans only the remaining minutes", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { generateSchedule } = await import("../src/controllers/sessions.controller");
    const userId = await makeUser();

    const task = await prisma.task.create({
      data: { userId, title: "Integration task", durationMin: 120, deadline: day(5, 23, 59), status: "IN_PROGRESS" },
    });
    // 30 min already studied yesterday (history), plus a stale planned block.
    const done = await prisma.studySession.create({
      data: { taskId: task.id, startsAt: day(-1, 10), endsAt: day(-1, 10, 30), completedAt: day(-1, 10, 30) },
    });
    const stale = await prisma.studySession.create({ data: { taskId: task.id, startsAt: day(3, 9), endsAt: day(3, 10) } });

    const res = fakeRes();
    await generateSchedule(fakeReq(userId), res);
    assert.equal(res.statusCode, 200);

    const kept = await prisma.studySession.findUnique({ where: { id: done.id } });
    assert.ok(kept, "the completed session survived the regenerate");
    assert.equal(kept.completedAt?.getTime(), done.completedAt?.getTime());
    assert.equal(kept.startsAt.getTime(), done.startsAt.getTime());
    assert.equal(await prisma.studySession.findUnique({ where: { id: stale.id } }), null, "the stale planned block was replaced");

    const planned = await prisma.studySession.findMany({ where: { taskId: task.id, completedAt: null } });
    const plannedMin = planned.reduce((s, p) => s + (p.endsAt.getTime() - p.startsAt.getTime()) / 60000, 0);
    assert.equal(plannedMin, 90, "120 min task minus 30 min done");

    const after = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(after?.status, "IN_PROGRESS", "work already started keeps its status");
  });

  it("is scoped to the caller: another user's sessions are untouched", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { generateSchedule } = await import("../src/controllers/sessions.controller");
    const alice = await makeUser();
    const bob = await makeUser();

    const bobTask = await prisma.task.create({
      data: { userId: bob, title: "Bob's task", durationMin: 60, deadline: day(4, 23, 59) },
    });
    const bobPlanned = await prisma.studySession.create({ data: { taskId: bobTask.id, startsAt: day(2, 9), endsAt: day(2, 10) } });
    await prisma.task.create({ data: { userId: alice, title: "Alice's task", durationMin: 60, deadline: day(4, 23, 59) } });

    const res = fakeRes();
    await generateSchedule(fakeReq(alice), res);
    assert.equal(res.statusCode, 200);

    assert.ok(await prisma.studySession.findUnique({ where: { id: bobPlanned.id } }), "Bob's planned block still exists");
    for (const s of res.body.sessions as { task: { userId: string } }[]) {
      assert.equal(s.task.userId, alice, "response only contains the caller's sessions");
    }
  });
});

describe("auth handlers (register, login, requireAuth)", () => {
  const password = "Correct-Horse-42x";

  it("register rejects a weak password with the shared rule, before touching the database", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { register } = await import("../src/controllers/auth.controller");
    const { ZodError } = await import("zod");
    const tag = randomUUID().slice(0, 8);
    // The error middleware turns a ZodError into 400 {details.fieldErrors}.
    await assert.rejects(
      register(fakeReq("", { email: `it-${tag}@example.com`, username: `it_${tag}`, password: "Password123!", name: "X" }), fakeRes()),
      (err: unknown) => err instanceof ZodError && "password" in err.flatten().fieldErrors
    );
    assert.equal(await prisma.user.count({ where: { email: `it-${tag}@example.com` } }), 0);
  });

  it("register stores a bcrypt cost-12 hash and never returns it", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { register } = await import("../src/controllers/auth.controller");
    const tag = randomUUID().slice(0, 8);
    const res = fakeRes();
    await register(fakeReq("", { email: `it-${tag}@example.com`, username: `it_${tag}`, password, name: "Reg Test" }), res);
    assert.equal(res.statusCode, 201);
    created.push(res.body.user.id);
    assert.ok(typeof res.body.token === "string" && res.body.token.length > 0);
    assert.equal("passwordHash" in res.body.user, false, "the hash never leaves the server");
    const row = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    assert.match(row!.passwordHash, /^\$2[aby]\$12\$/, "bcrypt with 12 rounds");
  });

  it("login gives the same 401 for an unknown email and a wrong password, and a token for the right one", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { register, login } = await import("../src/controllers/auth.controller");
    const tag = randomUUID().slice(0, 8);
    const email = `it-${tag}@example.com`;
    const reg = fakeRes();
    await register(fakeReq("", { email, username: `it_${tag}`, password, name: "Login Test" }), reg);
    created.push(reg.body.user.id);

    const unknown = fakeRes();
    await login(fakeReq("", { email: `nobody-${tag}@example.com`, password }), unknown);
    const wrong = fakeRes();
    await login(fakeReq("", { email, password: "Wrong-Horse-42x" }), wrong);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(unknown.body, wrong.body, "no account enumeration");

    const ok = fakeRes();
    await login(fakeReq("", { email, password }), ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.user.email, email);
  });

  it("requireAuth accepts a current token and rejects it once tokenVersion moves on", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { requireAuth } = await import("../src/middleware/auth.middleware");
    const { tokenFor } = await import("../src/lib/jwt");
    const userId = await makeUser();
    const token = tokenFor({ id: userId, tokenVersion: 0 });
    const call = async () => {
      const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
      const res = fakeRes();
      let nextCalled = false;
      await requireAuth(req, res, () => {
        nextCalled = true;
      });
      return { req, res, nextCalled };
    };

    const before = await call();
    assert.equal(before.nextCalled, true);
    assert.equal(before.req.userId, userId);

    // What a password change, used reset link or admin temporary password does.
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    const afterBump = await call();
    assert.equal(afterBump.nextCalled, false);
    assert.equal(afterBump.res.statusCode, 401);
  });
});

describe("AI parse (POST /api/ai/parse) with the model unavailable", () => {
  it("falls back to the rule parser and still answers 200", async (t) => {
    if (!dbUp) return t.skip("no database reachable");
    const { parseTask } = await import("../src/controllers/ai.controller");
    const userId = await makeUser();

    // logAiFailure writes one redacted line to stderr; silence it for clean output.
    const original = console.error;
    console.error = () => {};
    const res = fakeRes();
    try {
      await parseTask(fakeReq(userId, { text: "Study subnetting for 2 hours, urgent, due 30 Oct" }), res);
    } finally {
      console.error = original;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, "fallback");
    assert.equal(res.body.durationMin, 120);
    assert.equal(res.body.priority, "HIGH");
    assert.equal(await prisma.aiParseLog.count({ where: { userId } }), 1, "the request is still logged for the tier gate");
  });
});
