import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFS,
  HORIZON_DAYS,
  MAX_FOCUS_MIN,
  MAX_LESSONS_PER_DAY,
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
    courseId: over.courseId ?? null,
  };
}

// Minutes per local day, keyed by day offset from NOW (0 = today).
function minutesByDay(out: PlannedSession[], taskId?: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of out) {
    if (taskId && s.taskId !== taskId) continue;
    const off = Math.round(
      (new Date(s.startsAt.getFullYear(), s.startsAt.getMonth(), s.startsAt.getDate()).getTime() -
        new Date(2026, 9, 28).getTime()) / 86400000
    );
    m.set(off, (m.get(off) ?? 0) + mins(s));
  }
  return m;
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

describe("scheduler: spreads work instead of front-loading", () => {
  it("a 6-hour task due in 7 days is spread across the week, not packed into 3 days", () => {
    const t = task({ id: "six", durationMin: 360, deadline: day(7) });
    const out = buildSchedule([t], DEFAULT_PREFS, { now: NOW });
    const byDay = minutesByDay(out);
    const total = [...byDay.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, 360);
    assert.ok(byDay.size >= 6, `spread over ${byDay.size} days`);
    for (const [d, m] of byDay) {
      assert.ok(m <= 60, `day ${d} has ${m} min (expected an even ~45-50 min share)`);
      assert.ok(d <= 7, "nothing placed after the deadline");
    }
  });

  it("no day is overloaded while a later day before the deadline sits empty", () => {
    const tasks = [
      task({ id: "a", durationMin: 240, deadline: day(5) }),
      task({ id: "b", durationMin: 180, deadline: day(6) }),
    ];
    const byDay = minutesByDay(buildSchedule(tasks, DEFAULT_PREFS, { now: NOW }));
    const max = Math.max(...byDay.values());
    for (let d = 0; d <= 5; d++) {
      // If any day is at the cap, every day up to the deadline must have work.
      if (max >= DEFAULT_PREFS.maxDailyMins) assert.ok((byDay.get(d) ?? 0) > 0, `day ${d} empty while another is full`);
    }
    assert.ok(max < DEFAULT_PREFS.maxDailyMins, `max day load ${max} should be well under the cap`);
  });

  it("a short task stays one block instead of being shredded across days", () => {
    const out = buildSchedule([task({ id: "short", durationMin: 60, deadline: day(7) })], DEFAULT_PREFS, { now: NOW });
    assert.equal(out.length, 1);
    assert.equal(mins(out[0]), 60);
  });

  it("each task gets ONE block per day, split only above MAX_FOCUS_MIN", () => {
    const tasks = [
      task({ id: "big", durationMin: 150, deadline: day(0, 23, 0) }),
      task({ id: "mid", durationMin: 80, deadline: day(0, 23, 0) }),
    ];
    const out = buildSchedule(tasks, { ...DEFAULT_PREFS, maxDailyMins: 300 }, { now: NOW });
    const big = out.filter((s) => s.taskId === "big");
    const mid = out.filter((s) => s.taskId === "mid");
    assert.equal(mid.length, 1, "80 min -> one block");
    assert.equal(big.length, 2, "150 min -> two blocks");
    for (const b of big) assert.ok(mins(b) <= MAX_FOCUS_MIN);
    assert.equal(big.reduce((a, b) => a + mins(b), 0), 150);
  });

  it("keeps the 1.5x switch-penalty break between different cognitive categories", () => {
    const tasks = [
      task({ id: "x1", durationMin: 60, deadline: day(0, 23, 0), subjectId: "math", subject: { cognitiveCategory: "Analytical" } }),
      task({ id: "x2", durationMin: 60, deadline: day(0, 23, 0), subjectId: "essay", subject: { cognitiveCategory: "Verbal" } }),
    ];
    const out = [...buildSchedule(tasks, DEFAULT_PREFS, { now: NOW })].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const gap = (out[1].startsAt.getTime() - out[0].endsAt.getTime()) / 60000;
    assert.equal(gap, Math.round(DEFAULT_PREFS.breakMins * 1.5));
  });
});

describe("scheduler: course lesson pacing", () => {
  it(`spreads a course's lessons at most ${MAX_LESSONS_PER_DAY} per day`, () => {
    // Five 30-min lesson tasks with the same near deadline (the worst case for
    // the old greedy packer, which put them all on day 0).
    const lessons = Array.from({ length: 5 }, (_, i) =>
      task({ id: `lesson${i}`, durationMin: 30, deadline: day(2), courseId: "course-1", subjectId: "db" })
    );
    const out = buildSchedule(lessons, DEFAULT_PREFS, { now: NOW });
    const perDay = new Map<string, number>();
    for (const s of out) perDay.set(dayKey(s.startsAt), (perDay.get(dayKey(s.startsAt)) ?? 0) + 1);
    assert.equal(out.length, 5, "every lesson placed");
    assert.equal(perDay.size, 5, "five different days");
    for (const n of perDay.values()) assert.ok(n <= MAX_LESSONS_PER_DAY);
  });

  it("two different courses may each have a lesson on the same day", () => {
    const tasks = [
      task({ id: "c1l1", durationMin: 30, deadline: day(3), courseId: "c1" }),
      task({ id: "c2l1", durationMin: 30, deadline: day(3), courseId: "c2" }),
    ];
    const out = buildSchedule(tasks, DEFAULT_PREFS, { now: NOW });
    assert.equal(new Set(out.map((s) => dayKey(s.startsAt))).size, 1);
  });
});

describe("scheduler: determinism of the spread", () => {
  it("is byte-identical across runs with a mixed workload", () => {
    const tasks = [
      task({ id: "m1", durationMin: 360, deadline: day(7) }),
      task({ id: "m2", durationMin: 45, deadline: day(1), priority: "HIGH" }),
      task({ id: "m3", durationMin: 200, deadline: day(-1) }),
      ...Array.from({ length: 4 }, (_, i) => task({ id: `m4l${i}`, durationMin: 30, deadline: day(2 * (i + 1)), courseId: "cx" })),
    ];
    const a = JSON.stringify(buildSchedule(tasks, DEFAULT_PREFS, { now: NOW }));
    const b = JSON.stringify(buildSchedule([...tasks].reverse(), DEFAULT_PREFS, { now: NOW }));
    assert.equal(a, b);
  });
});
