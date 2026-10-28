import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MasteryInput, masteryComponents, masteryScore } from "../src/lib/mastery";

const d = (day: number) => new Date(2026, 9, day, 12, 0, 0, 0);
const lesson = (completedDay: number | null, score: number | null) => ({
  completedAt: completedDay === null ? null : d(completedDay),
  quizScore: score,
  quizAt: completedDay === null ? null : d(completedDay),
});

describe("mastery formula", () => {
  it("no data at all scores 0", () => {
    assert.equal(masteryScore({ lessons: [], plannedTaskMinutes: 0, completedSessions: [] }), 0);
  });

  it("weights 40 lessons / 30 quizzes / 30 study when all apply", () => {
    // 2/5 lessons (0.4), quiz sum 100+67 of 500 (0.334), study 90/300 (0.3)
    const input: MasteryInput = {
      lessons: [lesson(20, 100), lesson(21, 67), lesson(null, null), lesson(null, null), lesson(null, null)],
      plannedTaskMinutes: 300,
      completedSessions: [{ durationMin: 90, completedAt: d(22) }],
    };
    const c = masteryComponents(input);
    assert.equal(c.lessons, 0.4);
    assert.equal(c.quizzes, 0.334);
    assert.equal(c.study, 0.3);
    // round(100 * (40*0.4 + 30*0.334 + 30*0.3) / 100) = round(35.02) = 35
    assert.equal(masteryScore(input), 35);
  });

  it("re-normalises when a subject has no course (study only, out of 100)", () => {
    const input: MasteryInput = { lessons: [], plannedTaskMinutes: 200, completedSessions: [{ durationMin: 100, completedAt: d(20) }] };
    assert.equal(masteryComponents(input).lessons, null);
    assert.equal(masteryScore(input), 50);
  });

  it("study component is capped at 1", () => {
    const input: MasteryInput = { lessons: [], plannedTaskMinutes: 60, completedSessions: [{ durationMin: 500, completedAt: d(20) }] };
    assert.equal(masteryScore(input), 100);
  });

  it("first lesson + perfect quiz on a 5-lesson course with no study = 14 (the live demo jump)", () => {
    const input: MasteryInput = {
      lessons: [lesson(28, 100), lesson(null, null), lesson(null, null), lesson(null, null), lesson(null, null)],
      plannedTaskMinutes: 435,
      completedSessions: [],
    };
    // (40*0.2 + 30*0.2 + 30*0) / 100 = 14
    assert.equal(masteryScore(input), 14);
  });

  it("asOf only counts facts up to that instant (weekly change)", () => {
    const input: MasteryInput = {
      lessons: [lesson(20, 100), lesson(27, 100)],
      plannedTaskMinutes: 0,
      completedSessions: [],
    };
    assert.equal(masteryScore(input), 100);
    assert.equal(masteryScore(input, d(25)), 50);
  });
});
