import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CompletedSession,
  LessonFact,
  XP_RULES,
  XpFacts,
  currentStreak,
  levelFromXp,
  totalXp,
  xpBreakdown,
  xpEvents,
  xpForSession,
} from "../src/lib/gamification";

// Fixed local instants in Oct 2026; nothing reads the real clock.
const at = (day: number, h: number) => new Date(2026, 9, day, h, 0, 0, 0);

const session = (id: string, day: number, h: number, durationMin: number, cognitiveCategory: string): CompletedSession => ({
  id,
  durationMin,
  completedAt: at(day, h),
  subjectId: cognitiveCategory.toLowerCase(),
  cognitiveCategory,
});

const lesson = (id: string, courseId: string, completedDay: number | null, quizPassedDay: number | null, quizScore: number | null): LessonFact => ({
  id,
  courseId,
  completedAt: completedDay === null ? null : at(completedDay, 15),
  quizScore,
  quizPassedAt: quizPassedDay === null ? null : at(quizPassedDay, 15),
});

// A small worked example used by several tests. Hand-computed total:
//   s1 60 min Analytical      -> 20
//   s2 30 min Analytical      -> 10 + focus bonus round(10*1.25)-10 = 3
//   s3 45 min Verbal (next day, chain resets) -> 15
//   lesson completed -> 20, quiz passed -> 30, 1-lesson course complete -> 100
//   active days 20 Oct and 21 Oct -> 2 * 10
//   total = 20 + 13 + 15 + 20 + 30 + 100 + 20 = 218
const worked = (): XpFacts => ({
  sessions: [
    session("s1", 20, 10, 60, "Analytical"),
    session("s2", 20, 11, 30, "Analytical"),
    session("s3", 21, 9, 45, "Verbal"),
  ],
  lessons: [lesson("l1", "c1", 21, 21, 80)],
  courses: [{ id: "c1", title: "SQL joins", lessonCount: 1 }],
});

describe("XP: per-fact rules", () => {
  it("awards 1 XP per 3 study minutes, +25% for a focus bonus", () => {
    assert.deepEqual(xpForSession(60, false), { base: 20, bonus: 0 });
    assert.deepEqual(xpForSession(60, true), { base: 20, bonus: 5 });
  });

  it("gives the focus bonus only for a same-category session on the same day", () => {
    const events = xpEvents(worked());
    const bonuses = events.filter((e) => e.source === "focus_bonus");
    assert.equal(bonuses.length, 1, "only s2 follows a same-category session that day");
    assert.equal(bonuses[0].amount, 3);
    assert.equal(bonuses[0].at.getTime(), at(20, 11).getTime());
  });

  it("awards quiz XP once per lesson, however many retakes", () => {
    // quizPassedAt is stamped only on the FIRST pass; a better later score
    // changes quizScore, never adds a second quiz event.
    const facts: XpFacts = { sessions: [], lessons: [lesson("l1", "c1", null, 21, 100)], courses: [] };
    assert.equal(xpEvents(facts).filter((e) => e.source === "quiz").length, 1);
  });

  it("counts an active day once, however many facts fall on it", () => {
    const b = xpBreakdown(xpEvents(worked()));
    assert.equal(b.active_day, 2 * XP_RULES.ACTIVE_DAY);
  });

  it("awards course completion only when every lesson is complete", () => {
    const facts: XpFacts = {
      sessions: [],
      lessons: [lesson("l1", "c1", 20, null, null), lesson("l2", "c1", null, null, null)],
      courses: [{ id: "c1", title: "Half done", lessonCount: 2 }],
    };
    assert.equal(xpBreakdown(xpEvents(facts)).course, 0);
    facts.lessons[1] = lesson("l2", "c1", 22, null, null);
    assert.equal(xpBreakdown(xpEvents(facts)).course, XP_RULES.COURSE_COMPLETE);
  });
});

describe("XP: derived from facts, never stored", () => {
  it("matches the hand-computed total for the worked example", () => {
    assert.equal(totalXp(worked()), 218);
  });

  it("is order-independent: the same facts in any order give the same events", () => {
    const a = worked();
    const b: XpFacts = { sessions: [...a.sessions].reverse(), lessons: [...a.lessons].reverse(), courses: [...a.courses] };
    assert.deepEqual(xpEvents(a), xpEvents(b));
    assert.equal(totalXp(a), totalXp(b));
  });

  it("removing a fact removes its XP (deleting a course takes its XP with it)", () => {
    const facts = worked();
    const withCourse = totalXp(facts);
    const withoutCourse = totalXp({ ...facts, lessons: [], courses: [] });
    // Lesson 20 + quiz 30 + course 100. The 21 Oct active day stays because s3
    // was also completed that day.
    assert.equal(withCourse - withoutCourse, 150);
  });
});

describe("levels and streaks", () => {
  it("uses the triangular level curve (L2 at 100, L3 at 300, L4 at 600)", () => {
    assert.equal(levelFromXp(0).level, 1);
    assert.equal(levelFromXp(99).level, 1);
    assert.deepEqual(levelFromXp(100), { level: 2, intoLevel: 0, toNext: 200, span: 200 });
    assert.equal(levelFromXp(299).level, 2);
    assert.equal(levelFromXp(300).level, 3);
    assert.equal(levelFromXp(600).level, 4);
  });

  it("counts consecutive active days, tolerating no activity yet today", () => {
    const facts = worked(); // active 20 and 21 Oct
    assert.equal(currentStreak(facts, at(21, 20)), 2, "ending today");
    assert.equal(currentStreak(facts, at(22, 8)), 2, "nothing yet today: streak ends yesterday");
    assert.equal(currentStreak(facts, at(23, 8)), 0, "a missed day breaks it");
  });
});
