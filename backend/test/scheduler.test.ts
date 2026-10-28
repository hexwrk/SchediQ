import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFS,
  HORIZON_DAYS,
  PlannedSession,
  SchedulerPrefs,
  SchedulerTask,
  buildSchedule,
  scheduleIssues,
} from "../src/lib/scheduler";

// Fixed clock: Wed 28 Oct 2026, 14:07 local. Every test passes `now`
// explicitly, which is what makes the scheduler testable at all.
const NOW = new Date(2026, 9, 28, 14, 7, 0, 0);
const day = (offset: number, h = 23, m = 59) => new Date(2026, 9, 28 + offset, h, m, 0, 0);

let seq = 0;
function task(over: Partial<SchedulerTask> & { durationMin: number }): SchedulerTask {
  seq += 1;
  return {
    id: over.id ?? `t${String(seq).padStart(5, "0")}`,
    deadline: over.deadline ?? day(7),
    durationMin: over.durationMin,
    priority: over.priority ?? "MEDIUM",
    subjectId: over.subjectId ?? "s1",
    subject: over.subject ?? { cognitiveCategory: "Analytical" },
    status: over.status ?? "PENDING",
  };
}

const mins = (s: PlannedSession) => (s.endsAt.getTime() - s.startsAt.getTime()) / 60000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toIssueTasks = (tasks: SchedulerTask[]) =>
  tasks.map((t) => ({ id: t.id, title: t.id, deadline: t.deadline, durationMin: t.durationMin, status: t.status }));

describe("scheduler: determinism", () => {
  it("returns identical output for identical input", () => {
    const tasks = [task({ durationMin: 90 }), task({ durationMin: 120, priority: "HIGH" }), task({ durationMin: 45 })];
    const a = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    const b = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    assert.deepEqual(a, b);
  });

  it("does not depend on input order (stable id tiebreak)", () => {
    const tasks = [
      task({ id: "a", durationMin: 60, deadline: day(3) }),
      task({ id: "b", durationMin: 60, deadline: day(3) }),
      task({ id: "c", durationMin: 60, deadline: day(3) }),
    ];
    const forward = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    const reversed = buildSchedule([...tasks].reverse(), DEFAULT_PREFS, { now: NOW });
    assert.deepEqual(forward, reversed);
  });
});

describe("scheduler: placement rules", () => {
  it("never places a block in the past (starts at now rounded up to 5 min)", () => {
    const out = buildSchedule([task({ durationMin: 30 })], DEFAULT_PREFS, { now: NOW });
    assert.ok(out[0].startsAt.getTime() >= NOW.getTime());
    assert.equal(out[0].startsAt.getHours(), 14);
    assert.equal(out[0].startsAt.getMinutes(), 10);
  });

  it("respects maxDailyMins and never overlaps blocks", () => {
    const tasks = Array.from({ length: 8 }, () => task({ durationMin: 75 }));
    const out = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    const perDay = new Map<string, number>();
    for (const s of out) perDay.set(dayKey(s.startsAt), (perDay.get(dayKey(s.startsAt)) ?? 0) + mins(s));
    for (const total of perDay.values()) assert.ok(total <= DEFAULT_PREFS.maxDailyMins);
    const sorted = [...out].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].startsAt.getTime() >= sorted[i - 1].endsAt.getTime(), "blocks overlap");
    }
  });

  it("skips DONE tasks", () => {
    const out = buildSchedule([task({ durationMin: 60, status: "DONE" })], DEFAULT_PREFS, { now: NOW });
    assert.equal(out.length, 0);
  });
});

describe("scheduler: edge cases", () => {
  it("deadline in the past: scheduled as soon as possible and flagged OVERDUE", () => {
    const t = task({ durationMin: 60, deadline: day(-2) });
    const out = buildSchedule([t], DEFAULT_PREFS, { now: NOW });
    assert.equal(out.reduce((s, x) => s + mins(x), 0), 60, "all minutes placed");
    assert.equal(dayKey(out[0].startsAt), dayKey(NOW), "placed today, not dropped or back-dated");
    const issues = scheduleIssues(toIssueTasks([t]), out, DEFAULT_PREFS, NOW);
    assert.deepEqual(issues.map((i) => i.kind), ["OVERDUE"]);
    assert.match(issues[0].reason, /as soon as possible/);
  });

  it("task longer than maxDailyMins is split across days", () => {
    const prefs: SchedulerPrefs = { ...DEFAULT_PREFS, maxDailyMins: 120 };
    const t = task({ durationMin: 400, deadline: day(10) });
    const out = buildSchedule([t], prefs, { now: NOW });
    assert.equal(out.reduce((s, x) => s + mins(x), 0), 400);
    const days = new Set(out.map((s) => dayKey(s.startsAt)));
    assert.ok(days.size >= 4, `expected >= 4 days, got ${days.size}`);
    for (const s of out) assert.ok(mins(s) <= 120);
  });

  it("task that cannot fit before its deadline is kept and flagged AT_RISK", () => {
    const t = task({ durationMin: 600, deadline: day(1) });
    const out = buildSchedule([t], DEFAULT_PREFS, { now: NOW });
    assert.equal(out.reduce((s, x) => s + mins(x), 0), 600, "kept in full, not dropped");
    const issues = scheduleIssues(toIssueTasks([t]), out, DEFAULT_PREFS, NOW);
    assert.deepEqual(issues.map((i) => i.kind), ["AT_RISK"]);
    assert.match(issues[0].reason, /after the .* deadline/);
  });

  it("no tasks: empty schedule and no issues", () => {
    const out = buildSchedule([], DEFAULT_PREFS, { now: NOW });
    assert.deepEqual(out, []);
    assert.deepEqual(scheduleIssues([], [], DEFAULT_PREFS, NOW), []);
  });

  it("no saved preferences: defaults produce a valid schedule", () => {
    const out = buildSchedule([task({ durationMin: 90 })], DEFAULT_PREFS, { now: NOW });
    assert.equal(out.reduce((s, x) => s + mins(x), 0), 90);
    for (const s of out) {
      assert.ok(s.startsAt.getHours() >= 9);
      assert.ok(s.endsAt.getHours() < 21 || (s.endsAt.getHours() === 21 && s.endsAt.getMinutes() === 0));
    }
  });

  it("zero capacity: nothing placed, every task reported UNSCHEDULED with the reason", () => {
    const prefs: SchedulerPrefs = { ...DEFAULT_PREFS, preferredStart: "10:00", preferredEnd: "10:00" };
    const t = task({ durationMin: 60 });
    const out = buildSchedule([t], prefs, { now: NOW });
    assert.deepEqual(out, []);
    const issues = scheduleIssues(toIssueTasks([t]), out, prefs, NOW);
    assert.equal(issues[0].kind, "UNSCHEDULED");
    assert.match(issues[0].reason, /zero/);
  });

  it("large input: stays fast, respects the horizon, and reports the overflow", () => {
    const tasks = Array.from({ length: 2000 }, (_, i) =>
      task({ id: `big${String(i).padStart(5, "0")}`, durationMin: 60, deadline: day(30) })
    );
    const started = performance.now();
    const out = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 2000, `took ${elapsed.toFixed(0)} ms`);

    const lastAllowed = new Date(2026, 9, 28 + HORIZON_DAYS - 1, 23, 59);
    for (const s of out) assert.ok(s.endsAt.getTime() <= lastAllowed.getTime(), "block beyond horizon");

    const issues = scheduleIssues(toIssueTasks(tasks), out, DEFAULT_PREFS, NOW);
    const unscheduled = issues.filter((i) => i.kind === "UNSCHEDULED");
    const placedMin = out.reduce((s, x) => s + mins(x), 0);
    const missingMin = unscheduled.reduce((s, i) => s + i.unplacedMin, 0);
    assert.equal(placedMin + missingMin, 2000 * 60, "every minute is either placed or reported");
    assert.match(unscheduled[0].reason, new RegExp(`${HORIZON_DAYS} days`));
  });
});
