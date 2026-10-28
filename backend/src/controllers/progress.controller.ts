import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  CompletedSession,
  XP_RULES,
  XP_SOURCE_INFO,
  XpFacts,
  computeBadges,
  currentStreak,
  dailyTrend,
  levelFromXp,
  levelTitle,
  totalXp,
  xpBreakdown,
  xpEvents,
} from "../lib/gamification";
import { MASTERY_WEIGHTS, masteryComponents, masteryScore } from "../lib/mastery";

// Every number served here is DERIVED on request from persisted rows (see
// lib/gamification.ts). Nothing is cached or stored, so a reload always shows
// exactly what the database holds: the fix for XP that "didn't stick".

interface SessionRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
  task: { userId: string; subjectId: string | null; subject: { cognitiveCategory: string } | null };
}

const sessionSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  completedAt: true,
  task: { select: { userId: true, subjectId: true, subject: { select: { cognitiveCategory: true } } } },
} as const;

function minutes(row: { startsAt: Date; endsAt: Date }): number {
  return Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000);
}

function toCompleted(row: SessionRow): CompletedSession {
  return {
    id: row.id,
    durationMin: minutes(row),
    completedAt: row.completedAt as Date,
    subjectId: row.task.subjectId,
    cognitiveCategory: row.task.subject?.cognitiveCategory ?? "General",
  };
}

// Load XP facts for a set of users in three queries total (not three per user),
// grouped by userId. The leaderboard and the current user share this path so
// the math is identical for everyone.
async function loadFacts(userIds: string[]): Promise<Map<string, XpFacts>> {
  const [sessions, courses] = await Promise.all([
    prisma.studySession.findMany({
      where: { completedAt: { not: null }, task: { userId: { in: userIds } } },
      select: sessionSelect,
    }),
    prisma.course.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        title: true,
        userId: true,
        lessons: { select: { id: true, courseId: true, completedAt: true, quizScore: true, quizPassedAt: true } },
      },
    }),
  ]);

  const facts = new Map<string, XpFacts>(userIds.map((id) => [id, { sessions: [], lessons: [], courses: [] }]));
  for (const s of sessions as SessionRow[]) {
    facts.get(s.task.userId)?.sessions.push(toCompleted(s));
  }
  for (const c of courses) {
    const f = facts.get(c.userId);
    if (!f) continue;
    f.courses.push({ id: c.id, title: c.title, lessonCount: c.lessons.length });
    f.lessons.push(...c.lessons);
  }
  return facts;
}

// Clean Sweep: did any single day have ALL of its sessions completed?
function hadCleanSweepDay(all: { startsAt: Date; completedAt: Date | null }[]): boolean {
  const byDay = new Map<string, { total: number; done: number }>();
  for (const s of all) {
    const d = s.startsAt;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const entry = byDay.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (s.completedAt !== null) entry.done += 1;
    byDay.set(key, entry);
  }
  for (const { total, done } of byDay.values()) {
    if (total > 0 && total === done) return true;
  }
  return false;
}

// Monday 00:00 local of the current week: the "this week" boundary.
function startOfWeek(now: Date): Date {
  const dow = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
}

function xpPerDay(events: { amount: number; at: Date }[]): { date: string; xp: number }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const totals = new Map<string, number>();
  for (const e of events) {
    const d = e.at;
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, xp]) => ({ date, xp }));
}

// GET /api/progress
export async function getProgress(req: Request, res: Response) {
  const userId = req.userId as string;
  const now = new Date();

  // Admin accounts are operators, not students, so they are left off the board.
  const users = await prisma.user.findMany({
    where: { OR: [{ role: "USER" }, { id: userId }] },
    select: { id: true, name: true, email: true, role: true },
  });
  const factsByUser = await loadFacts(users.map((u) => u.id));
  const facts = factsByUser.get(userId) ?? { sessions: [], lessons: [], courses: [] };

  const allSessions = await prisma.studySession.findMany({
    where: { task: { userId } },
    select: { startsAt: true, completedAt: true },
  });

  const events = xpEvents(facts);
  const xp = events.reduce((sum, e) => sum + e.amount, 0);
  const levelProgress = levelFromXp(xp);

  const scored = users
    .filter((u) => u.role === "USER")
    .map((u) => ({
      id: u.id,
      name: u.name || u.email.split("@")[0],
      xp: totalXp(factsByUser.get(u.id) as XpFacts),
      isCurrentUser: u.id === userId,
    }));
  scored.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const leaderboard = scored.map((entry, i) => ({ ...entry, rank: i + 1, level: levelFromXp(entry.xp).level }));
  const me = leaderboard.find((e) => e.isCurrentUser);

  return res.json({
    xp,
    level: levelProgress.level,
    levelTitle: levelTitle(levelProgress.level),
    levelProgress,
    streak: currentStreak(facts, now),
    badges: computeBadges(facts, now, { cleanSweep: hadCleanSweepDay(allSessions) }),
    breakdown: xpBreakdown(events),
    xpRules: { values: XP_RULES, sources: XP_SOURCE_INFO },
    recentEvents: events.slice(-8).reverse(),
    // XP per local day over the whole history (sparse: active days only), for
    // the Progress report's date-range chart.
    xpByDay: xpPerDay(events),
    leaderboard,
    rank: me?.rank ?? null,
    totalUsers: leaderboard.length,
  });
}

// GET /api/progress/overview
// The dashboard "progress home": weekly summary, per-subject mastery with its
// weekly change, active-course progress, and a 14-day trend.
export async function getOverview(req: Request, res: Response) {
  const userId = req.userId as string;
  const now = new Date();
  const weekStart = startOfWeek(now);

  const [facts, subjects, tasks, sessions, courses] = await Promise.all([
    loadFacts([userId]).then((m) => m.get(userId) as XpFacts),
    prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { userId }, select: { subjectId: true, durationMin: true } }),
    prisma.studySession.findMany({
      where: { task: { userId }, completedAt: { not: null } },
      select: { startsAt: true, endsAt: true, completedAt: true, task: { select: { subjectId: true } } },
    }),
    prisma.course.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, colorTag: true } },
        lessons: { select: { completedAt: true, quizScore: true, quizPassedAt: true } },
      },
    }),
  ]);

  const events = xpEvents(facts);
  const xp = events.reduce((sum, e) => sum + e.amount, 0);
  const inWeek = (d: Date | null) => d !== null && d.getTime() >= weekStart.getTime();

  const week = {
    start: weekStart.toISOString(),
    studyMinutes: facts.sessions.filter((s) => inWeek(s.completedAt)).reduce((sum, s) => sum + s.durationMin, 0),
    lessonsCompleted: facts.lessons.filter((l) => inWeek(l.completedAt)).length,
    quizzesPassed: facts.lessons.filter((l) => inWeek(l.quizPassedAt)).length,
    xpEarned: events.filter((e) => inWeek(e.at)).reduce((sum, e) => sum + e.amount, 0),
    streak: currentStreak(facts, now),
    level: levelFromXp(xp).level,
    levelTitle: levelTitle(levelFromXp(xp).level),
    xp,
  };

  const mastery = subjects.map((s) => {
    const input = {
      lessons: courses
        .filter((c) => c.subjectId === s.id)
        .flatMap((c) => c.lessons)
        .map((l) => ({ completedAt: l.completedAt, quizScore: l.quizScore, quizAt: l.quizPassedAt ?? l.completedAt })),
      plannedTaskMinutes: tasks.filter((t) => t.subjectId === s.id).reduce((sum, t) => sum + t.durationMin, 0),
      completedSessions: sessions
        .filter((x) => x.task.subjectId === s.id)
        .map((x) => ({ durationMin: minutes(x), completedAt: x.completedAt as Date })),
    };
    const nowScore = masteryScore(input);
    return {
      subjectId: s.id,
      name: s.name,
      colorTag: s.colorTag,
      mastery: nowScore,
      changeThisWeek: nowScore - masteryScore(input, weekStart),
      components: masteryComponents(input),
    };
  });

  const courseCards = courses.map((c) => {
    const done = c.lessons.filter((l) => l.completedAt).length;
    return {
      id: c.id,
      title: c.title,
      topic: c.topic,
      level: c.level,
      subject: c.subject,
      lessonsDone: done,
      lessonsTotal: c.lessons.length,
      completed: c.lessons.length > 0 && done === c.lessons.length,
    };
  });

  // Drives first-run onboarding on the dashboard (what has the user set up yet?).
  const counts = {
    subjects: subjects.length,
    tasks: tasks.length,
    courses: courses.length,
    sessions: await prisma.studySession.count({ where: { task: { userId } } }),
  };

  return res.json({
    counts,
    week,
    mastery,
    masteryWeights: MASTERY_WEIGHTS,
    courses: courseCards,
    trend: dailyTrend(facts, events, now, 14),
  });
}
