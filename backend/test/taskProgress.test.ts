import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statusFromSessions, taskProgress } from "../src/lib/taskProgress";

const at = (day: number, h: number) => new Date(2026, 9, day, h, 0, 0, 0);
// Three 50-minute sessions (150 min), as the brief's example.
const sessions = (done: number) =>
  [0, 1, 2].map((i) => ({
    startsAt: at(28 + i, 9),
    endsAt: new Date(at(28 + i, 9).getTime() + 50 * 60000),
    completedAt: i < done ? at(28 + i, 10) : null,
  }));

describe("task progress (derived from sessions)", () => {
  it("0 / 1 / 2 / 3 of 3 sessions -> 0% / 33% / 67% / 100%", () => {
    assert.deepEqual([0, 1, 2, 3].map((n) => taskProgress(150, sessions(n)).percent), [0, 33, 67, 100]);
  });

  it("reports minutes, counts and the next session", () => {
    const p = taskProgress(150, sessions(1));
    assert.equal(p.totalMin, 150);
    assert.equal(p.completedMin, 50);
    assert.equal(p.sessionsTotal, 3);
    assert.equal(p.sessionsDone, 1);
    assert.equal(p.nextSessionAt, at(29, 9).toISOString());
    assert.equal(taskProgress(150, sessions(3)).nextSessionAt, null);
  });

  it("no sessions: total falls back to the task duration, 0%", () => {
    const p = taskProgress(120, []);
    assert.equal(p.totalMin, 120);
    assert.equal(p.percent, 0);
    assert.equal(p.nextSessionAt, null);
  });

  it("status follows progress", () => {
    assert.equal(statusFromSessions(0, 0), "PENDING");
    assert.equal(statusFromSessions(3, 0), "SCHEDULED");
    assert.equal(statusFromSessions(3, 1), "IN_PROGRESS");
    assert.equal(statusFromSessions(3, 2), "IN_PROGRESS");
    assert.equal(statusFromSessions(3, 3), "DONE");
  });
});
