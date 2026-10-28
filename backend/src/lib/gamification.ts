// Gamification engine. PURE and DERIVED: every XP number is computed from facts
// already persisted in Postgres (completed study sessions, completed lessons,
// quiz scores, finished courses), never stored as a running total. Recomputing
// from the same facts always yields the same result, so XP cannot drift, double
// count, or get lost on reload: if the fact is in the DB, its XP is too.
//
// "Event-driven" here means each fact is turned into an XpEvent with a source,
// an amount and a timestamp. Totals, the per-source breakdown, the 14-day trend
// and the "recent XP" feed are all sums over that one event list.

// ---------- XP rules (the single source of truth; shown on the Progress page) ----------

export const XP_RULES = {
  // Study session: 1 XP per 3 minutes of completed study time.
  SESSION_MINUTES_PER_XP: 3,
  // +25% when the previous completed session THAT DAY was the same cognitive
  // category: rewards low task-switching, the point of the clustering feature.
  FOCUS_BONUS_MULTIPLIER: 1.25,
  // Completing a course lesson.
  LESSON_COMPLETE: 20,
  // Passing a lesson quiz (best score >= QUIZ_PASS_MARK percent). Once per lesson.
  QUIZ_PASS: 30,
  QUIZ_PASS_MARK: 70,
  // Each calendar day with any activity (session, lesson or quiz pass).
  ACTIVE_DAY: 10,
  // Milestone for completing every lesson in a course.
  COURSE_COMPLETE: 100,
} as const;

export type XpSource = "session" | "focus_bonus" | "lesson" | "quiz" | "active_day" | "course";

export const XP_SOURCE_INFO: { source: XpSource; label: string; howTo: string; amount: string }[] = [
  {
    source: "session",
    label: "Study sessions",
    howTo: "Click a study block on the Dashboard calendar to mark it complete.",
    amount: `1 XP per ${XP_RULES.SESSION_MINUTES_PER_XP} min studied`,
  },
  {
    source: "focus_bonus",
    label: "Focus bonus",
    howTo: "Complete two sessions of the same cognitive category back to back on the same day.",
    amount: `+${Math.round((XP_RULES.FOCUS_BONUS_MULTIPLIER - 1) * 100)}% on that session`,
  },
  {
    source: "lesson",
    label: "Lessons",
    howTo: "Finish a lesson in one of your generated courses.",
    amount: `+${XP_RULES.LESSON_COMPLETE} XP`,
  },
  {
    source: "quiz",
    label: "Quizzes",
    howTo: `Score ${XP_RULES.QUIZ_PASS_MARK}% or more on a lesson quiz (once per lesson).`,
    amount: `+${XP_RULES.QUIZ_PASS} XP`,
  },
  {
    source: "active_day",
    label: "Daily activity",
    howTo: "Do anything above on a given day. Consecutive days build your streak.",
    amount: `+${XP_RULES.ACTIVE_DAY} XP per day`,
  },
  {
    source: "course",
    label: "Course complete",
    howTo: "Complete every lesson in a course.",
    amount: `+${XP_RULES.COURSE_COMPLETE} XP`,
  },
];

// ---------- Facts (inputs) ----------

export interface CompletedSession {
  id: string;
  durationMin: number;
  completedAt: Date;
  // Subject of the session's task (null if the task has no subject).
  subjectId: string | null;
  // Cognitive category of the session's task's subject ("General" if none).
  cognitiveCategory: string;
}

export interface LessonFact {
  id: string;
  courseId: string;
  completedAt: Date | null;
  quizScore: number | null;
  quizPassedAt: Date | null;
}

export interface CourseFact {
  id: string;
  title: string;
  lessonCount: number;
}

export interface XpFacts {
  sessions: CompletedSession[];
  lessons: LessonFact[];
  courses: CourseFact[];
}

export interface XpEvent {
  source: XpSource;
  amount: number;
  at: Date;
  label: string;
}

export interface LevelProgress {
  level: number;
  intoLevel: number; // XP earned inside the current level
  toNext: number;    // XP still needed to reach the next level
  span: number;      // total XP width of the current level (intoLevel + toNext)
}

export interface Badge {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

// ---------- Helpers ----------

// Local calendar-day key so "same day" and streak logic use the server/user
// zone (UTC+2) consistently, matching how the scheduler builds instants.
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function xpForSession(durationMin: number, focusBonus: boolean): { base: number; bonus: number } {
  const base = Math.round(durationMin / XP_RULES.SESSION_MINUTES_PER_XP);
  const withBonus = focusBonus ? Math.round(base * XP_RULES.FOCUS_BONUS_MULTIPLIER) : base;
  return { base, bonus: withBonus - base };
}

// A course is complete when it has lessons and every one is completed. Its
// completion instant is the latest lesson completion.
function completedCourses(facts: XpFacts): { course: CourseFact; at: Date }[] {
  const byCourse = new Map<string, LessonFact[]>();
  for (const l of facts.lessons) {
    const list = byCourse.get(l.courseId) ?? [];
    list.push(l);
    byCourse.set(l.courseId, list);
  }
  const out: { course: CourseFact; at: Date }[] = [];
  for (const c of facts.courses) {
    const lessons = byCourse.get(c.id) ?? [];
    if (c.lessonCount === 0 || lessons.length < c.lessonCount) continue;
    if (!lessons.every((l) => l.completedAt)) continue;
    const at = new Date(Math.max(...lessons.map((l) => (l.completedAt as Date).getTime())));
    out.push({ course: c, at });
  }
  return out;
}

// Every day key with qualifying activity (drives ACTIVE_DAY XP and the streak).
export function activeDays(facts: XpFacts): Map<string, Date> {
  const days = new Map<string, Date>();
  const add = (d: Date | null) => {
    if (!d) return;
    const k = dayKey(d);
    if (!days.has(k)) days.set(k, startOfDay(d));
  };
  facts.sessions.forEach((s) => add(s.completedAt));
  facts.lessons.forEach((l) => {
    add(l.completedAt);
    add(l.quizPassedAt);
  });
  return days;
}

// ---------- The derivation ----------

export function xpEvents(facts: XpFacts): XpEvent[] {
  const events: XpEvent[] = [];

  // Sessions in time order; the focus-bonus chain resets each day.
  const sorted = [...facts.sessions].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  let currentDay: string | null = null;
  let prevCategory: string | null = null;
  for (const s of sorted) {
    const key = dayKey(s.completedAt);
    if (key !== currentDay) {
      currentDay = key;
      prevCategory = null;
    }
    const focus = prevCategory !== null && prevCategory === s.cognitiveCategory;
    const { base, bonus } = xpForSession(s.durationMin, focus);
    events.push({ source: "session", amount: base, at: s.completedAt, label: `${s.durationMin} min study session` });
    if (bonus > 0) {
      events.push({ source: "focus_bonus", amount: bonus, at: s.completedAt, label: `Focus bonus (${s.cognitiveCategory})` });
    }
    prevCategory = s.cognitiveCategory;
  }

  for (const l of facts.lessons) {
    if (l.completedAt) {
      events.push({ source: "lesson", amount: XP_RULES.LESSON_COMPLETE, at: l.completedAt, label: "Lesson completed" });
    }
    // quizPassedAt is only ever set once (first pass), so a retake cannot farm XP.
    if (l.quizPassedAt) {
      events.push({ source: "quiz", amount: XP_RULES.QUIZ_PASS, at: l.quizPassedAt, label: `Quiz passed (${l.quizScore ?? 0}%)` });
    }
  }

  for (const [, day] of activeDays(facts)) {
    events.push({ source: "active_day", amount: XP_RULES.ACTIVE_DAY, at: day, label: "Active day" });
  }

  for (const { course, at } of completedCourses(facts)) {
    events.push({ source: "course", amount: XP_RULES.COURSE_COMPLETE, at, label: `Course complete: ${course.title}` });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function totalXp(facts: XpFacts): number {
  return xpEvents(facts).reduce((sum, e) => sum + e.amount, 0);
}

export function xpBreakdown(events: XpEvent[]): Record<XpSource, number> {
  const out: Record<XpSource, number> = { session: 0, focus_bonus: 0, lesson: 0, quiz: 0, active_day: 0, course: 0 };
  for (const e of events) out[e.source] += e.amount;
  return out;
}

// ---------- Levels ----------

// Cumulative XP required to have REACHED level L: 100 * (L-1) * L / 2.
// L1=0, L2=100, L3=300, L4=600, L5=1000, L6=1500, L7=2100, ...
export function cumXpForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

export function levelFromXp(xp: number): LevelProgress {
  let level = 1;
  while (xp >= cumXpForLevel(level + 1)) {
    level++;
  }
  const floor = cumXpForLevel(level);
  const ceil = cumXpForLevel(level + 1);
  return { level, intoLevel: xp - floor, toNext: ceil - xp, span: ceil - floor };
}

const LEVEL_TITLES = ["Novice", "Apprentice", "Learner", "Scholar", "Specialist", "Expert", "Master"];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[level - 1] ?? "Grandmaster";
}

// ---------- Streak ----------

// Consecutive active days ending today, or ending yesterday if nothing has been
// done yet today (so the streak does not reset at midnight before you study).
export function currentStreak(facts: XpFacts, now: Date): number {
  const days = activeDays(facts);
  if (days.size === 0) return 0;

  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    // Date arithmetic via the constructor handles DST and month rollover.
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

// ---------- Badges ----------

// Clean Sweep needs every planned session of a day (not just completed ones),
// so the caller computes it and passes it in.
export function computeBadges(facts: XpFacts, now: Date, opts: { cleanSweep: boolean }): Badge[] {
  const xp = totalXp(facts);
  const { level } = levelFromXp(xp);
  const streak = currentStreak(facts, now);

  // Deep Focus: two SAME-SUBJECT completed sessions back-to-back within a day.
  const sorted = [...facts.sessions].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  let deepFocus = false;
  let currentDay: string | null = null;
  let prevSubject: string | null | undefined = undefined;
  for (const s of sorted) {
    const key = dayKey(s.completedAt);
    if (key !== currentDay) {
      currentDay = key;
      prevSubject = undefined;
    }
    if (prevSubject !== undefined && s.subjectId !== null && prevSubject === s.subjectId) {
      deepFocus = true;
    }
    prevSubject = s.subjectId;
  }

  const lessonsDone = facts.lessons.filter((l) => l.completedAt).length;
  const coursesDone = completedCourses(facts).length;

  return [
    { key: "first_focus", label: "First Focus", description: "Complete your first study session", unlocked: facts.sessions.length >= 1 },
    { key: "century", label: "Century", description: "Earn 100 XP", unlocked: xp >= 100 },
    { key: "rising_star", label: "Rising Star", description: "Reach level 3", unlocked: level >= 3 },
    { key: "clean_sweep", label: "Clean Sweep", description: "Complete every session planned for a day", unlocked: opts.cleanSweep },
    { key: "deep_focus", label: "Deep Focus", description: "Finish two same-subject sessions back-to-back", unlocked: deepFocus },
    { key: "week_warrior", label: "Week Warrior", description: "Hold a 7-day streak", unlocked: streak >= 7 },
    { key: "first_course", label: "First Course", description: "Complete your first course lesson", unlocked: lessonsDone >= 1 },
    {
      key: "quiz_ace",
      label: "Quiz Ace",
      description: "Score 100% on a lesson quiz",
      unlocked: facts.lessons.some((l) => l.quizScore === 100),
    },
    { key: "course_complete", label: "Course Complete", description: "Finish every lesson in a course", unlocked: coursesDone >= 1 },
    { key: "scholar", label: "Scholar", description: "Complete 10 lessons", unlocked: lessonsDone >= 10 },
  ];
}

// ---------- Time series ----------

// Per-day XP and study minutes for the last `days` days (oldest first),
// ending today. Feeds the dashboard trend chart.
export function dailyTrend(
  facts: XpFacts,
  events: XpEvent[],
  now: Date,
  days = 14
): { date: string; xp: number; studyMinutes: number }[] {
  const out: { key: string; date: string; xp: number; studyMinutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const pad = (n: number) => String(n).padStart(2, "0");
    out.push({ key: dayKey(d), date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, xp: 0, studyMinutes: 0 });
  }
  const index = new Map(out.map((o, i) => [o.key, i]));
  for (const e of events) {
    const i = index.get(dayKey(e.at));
    if (i !== undefined) out[i].xp += e.amount;
  }
  for (const s of facts.sessions) {
    const i = index.get(dayKey(s.completedAt));
    if (i !== undefined) out[i].studyMinutes += s.durationMin;
  }
  return out.map(({ key: _key, ...rest }) => rest);
}
