import { Request, Response } from "express";
import { z } from "zod";
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
    // Replace only the PLANNED (incomplete) sessions. Completed sessions are
    // study history that XP/streak derive from, so regenerating the forward
    // plan must never erase them. Scoped via the task relation.
    await tx.studySession.deleteMany({
      where: { task: { userId }, completedAt: null },
    });

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

const toggleSchema = z.object({ completed: z.boolean() });

// PATCH /api/sessions/:id
// Mark a single session complete/incomplete (scoped to the user's own
// sessions). Completion lives on the session; we then keep the parent task's
// status roughly in sync: a task is DONE when all its sessions are complete,
// otherwise it falls back to SCHEDULED.
export async function toggleSession(req: Request, res: Response) {
  const userId = req.userId as string;
  const { completed } = toggleSchema.parse(req.body);

  // Ownership check via the task relation before mutating.
  const existing = await prisma.studySession.findFirst({
    where: { id: req.params.id as string, task: { userId } },
    include: { task: true },
  });
  if (!existing) {
    return res.status(404).json({ error: "Session not found" });
  }

  const session = await prisma.$transaction(async (tx) => {
    await tx.studySession.update({
      where: { id: existing.id },
      data: { completedAt: completed ? new Date() : null },
    });

    // Recompute the parent task's status from its sessions.
    const siblings = await tx.studySession.findMany({
      where: { taskId: existing.taskId },
      select: { completedAt: true },
    });
    const allDone =
      siblings.length > 0 && siblings.every((s) => s.completedAt !== null);
    await tx.task.update({
      where: { id: existing.taskId },
      data: { status: allDone ? "DONE" : "SCHEDULED" },
    });

    return tx.studySession.findFirst({
      where: { id: existing.id },
      include: { task: { include: { subject: true } } },
    });
  });

  return res.json({ session });
}
