import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  Badge,
  CompletedSession,
  LevelProgress,
  computeBadges,
  currentStreak,
  levelFromXp,
  totalXp,
} from "../lib/gamification";

// Shape of a session row loaded with everything the engine needs. Completion is
// optional; we filter to completed ones for XP.
interface SessionRow {
  id: string;
  durationMin?: number;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
  task: { subjectId: string | null; subject: { cognitiveCategory: string } | null };
}

// Map a completed DB session row into the engine's CompletedSession.
function toCompleted(row: SessionRow): CompletedSession {
  return {
    id: row.id,
    durationMin: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    completedAt: row.completedAt as Date,
    subjectId: row.task.subjectId,
    cognitiveCategory: row.task.subject?.cognitiveCategory ?? "General",
  };
}

// Derive a user's XP from their sessions. Reused for the current user and for
// every leaderboard entry so the math is identical for everyone.
async function xpForUser(userId: string): Promise<number> {
  const rows = await prisma.studySession.findMany({
    where: { task: { userId }, completedAt: { not: null } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      completedAt: true,
      task: { select: { subjectId: true, subject: { select: { cognitiveCategory: true } } } },
    },
  });
  return totalXp((rows as SessionRow[]).map(toCompleted));
}

// Clean Sweep: did any single day have ALL of its sessions completed? Needs the
// full session set (not just completed ones), so it is computed here.
function hadCleanSweepDay(all: SessionRow[]): boolean {
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

// GET /api/progress
export async function getProgress(req: Request, res: Response) {
  const userId = req.userId as string;
  const now = new Date();

  // All of the user's sessions (for Clean Sweep + totals), completed subset for XP.
  const allRows = (await prisma.studySession.findMany({
    where: { task: { userId } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      completedAt: true,
      task: { select: { subjectId: true, subject: { select: { cognitiveCategory: true } } } },
    },
  })) as SessionRow[];

  const completed = allRows.filter((r) => r.completedAt !== null).map(toCompleted);

  const xp = totalXp(completed);
  const levelProgress: LevelProgress = levelFromXp(xp);
  const streak = currentStreak(completed, now);
  const badges: Badge[] = computeBadges(completed, now, {
    cleanSweep: hadCleanSweepDay(allRows),
  });

  // Leaderboard: rank ALL users by derived XP (identical math for everyone),
  // flag the current user, return their rank and the cohort total.
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const scored = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      // Prefer a display name; fall back to the email's local part.
      name: u.name ?? u.email.split("@")[0],
      xp: await xpForUser(u.id),
      isCurrentUser: u.id === userId,
      // The seeded cohort uses the demo.schediq.app domain; label it as demo.
      isDemo: u.email.endsWith("@demo.schediq.app"),
    }))
  );

  scored.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const leaderboard = scored.map((entry, i) => {
    const { level } = levelFromXp(entry.xp);
    return { ...entry, rank: i + 1, level };
  });

  const me = leaderboard.find((e) => e.isCurrentUser);

  return res.json({
    xp,
    level: levelProgress.level,
    levelProgress,
    streak,
    badges,
    leaderboard,
    rank: me?.rank ?? null,
    totalUsers: leaderboard.length,
  });
}
