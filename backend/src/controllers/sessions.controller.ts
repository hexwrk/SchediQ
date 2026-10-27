import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { buildSchedule, SchedulerTask, SchedulerPrefs } from "../lib/scheduler";

// GET /api/sessions
// Return the user's planned sessions ordered by start time, each with its task
// and that task's subject so the calendar can colour blocks by subject.
export async function listSessions(req: Request, res: Response) {
  const sessions = await prisma.studySession.findMany({
    where: { task: { userId: req.userId } },
    orderBy: { startsAt: "asc" },
    include: { task: { include: { subject: true } } },
  });
  return res.json({ sessions });
}

// POST /api/sessions/generate
// Load the user's tasks + preferences, run the deterministic scheduler, then
// atomically replace the user's sessions with the freshly computed ones and
// mark the scheduled tasks SCHEDULED. Delete-then-recreate runs inside a single
// transaction so a mid-generation failure can never leave a half-written
// schedule (requirement from the spec and the SRS).
export async function generateSchedule(req: Request, res: Response) {
  const userId = req.userId as string;

  // Upsert default preferences if the user has none yet, mirroring the
  // preferences controller so generate works for a brand-new account.
  const preference = await prisma.preference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const tasks = await prisma.task.findMany({
    where: { userId },
    include: { subject: true },
  });

  const prefs: SchedulerPrefs = {
    maxDailyMins: preference.maxDailyMins,
    preferredStart: preference.preferredStart,
    preferredEnd: preference.preferredEnd,
    breakMins: preference.breakMins,
    clustering: preference.clustering,
  };

  // The controller supplies the clock; the scheduler itself stays pure.
  const planned = buildSchedule(tasks as unknown as SchedulerTask[], prefs, {
    now: new Date(),
  });

  // Tasks that actually received at least one block become SCHEDULED.
  const scheduledTaskIds = Array.from(new Set(planned.map((p) => p.taskId)));

  const sessions = await prisma.$transaction(async (tx) => {
    // Wipe the user's existing sessions (scoped via the task relation).
    await tx.studySession.deleteMany({ where: { task: { userId } } });

    if (planned.length > 0) {
      await tx.studySession.createMany({
        data: planned.map((p) => ({
          taskId: p.taskId,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
        })),
      });
    }

    // Flip placed tasks to SCHEDULED without touching DONE tasks.
    if (scheduledTaskIds.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: scheduledTaskIds }, userId, status: { not: "DONE" } },
        data: { status: "SCHEDULED" },
      });
    }

    return tx.studySession.findMany({
      where: { task: { userId } },
      orderBy: { startsAt: "asc" },
      include: { task: { include: { subject: true } } },
    });
  });

  return res.json({ sessions });
}
