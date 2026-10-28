import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ProgressSession, statusFromSessions, taskProgress } from "../lib/taskProgress";
import { deadlineField, intField, titleField } from "../lib/validators";

// Every task response carries a derived `progress` object (see
// lib/taskProgress.ts) computed from its study sessions. Only the fields the
// calculation needs are selected, and the raw sessions are not sent back.
const withSessions = {
  subject: true,
  sessions: { select: { startsAt: true, endsAt: true, completedAt: true } },
} as const;

function present<T extends { durationMin: number; sessions: ProgressSession[] }>(task: T) {
  const { sessions, ...rest } = task;
  return { ...rest, progress: taskProgress(task.durationMin, sessions) };
}

// Field rules (title length, deadline sanity, 5-600 minute duration) are the
// shared ones the task forms enforce client-side.
const taskSchema = z.object({
  title: titleField,
  deadline: deadlineField,
  durationMin: intField("durationMin"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"], { message: "Priority must be LOW, MEDIUM or HIGH." }).optional(),
  status: z.enum(["PENDING", "SCHEDULED", "IN_PROGRESS", "DONE"]).optional(),
  subjectId: z.string().uuid("Unknown subject.").nullable().optional(),
});

export async function listTasks(req: Request, res: Response) {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId },
    orderBy: { deadline: "asc" },
    include: withSessions,
  });
  return res.json({ tasks: tasks.map(present) });
}

export async function getTask(req: Request, res: Response) {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
    include: withSessions,
  });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.json({ task: present(task) });
}

export async function createTask(req: Request, res: Response) {
  const data = taskSchema.parse(req.body);

  if (data.subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: data.subjectId, userId: req.userId },
    });
    if (!subject) {
      return res.status(400).json({ error: "Unknown subjectId" });
    }
  }

  const task = await prisma.task.create({
    data: { ...data, userId: req.userId as string },
    include: withSessions,
  });
  return res.status(201).json({ task: present(task) });
}

export async function updateTask(req: Request, res: Response) {
  const data = taskSchema.partial().parse(req.body);

  const existing = await prisma.task.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (data.subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: data.subjectId, userId: req.userId },
    });
    if (!subject) {
      return res.status(400).json({ error: "Unknown subjectId" });
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: existing.id },
      data,
      include: withSessions,
    });
    // Ticking a lesson-linked task DONE completes its lesson (same rule as
    // finishing its study blocks), keeping one progress system.
    if (data.status === "DONE" && updated.lessonId) {
      await tx.lesson.updateMany({
        where: { id: updated.lessonId, completedAt: null },
        data: { completedAt: new Date() },
      });
    }
    // DONE may be set by hand (finished outside the plan). Any other status is
    // re-derived from the sessions, so un-ticking a half-done task returns it
    // to IN_PROGRESS rather than a misleading PENDING.
    if (data.status !== undefined && data.status !== "DONE") {
      const done = updated.sessions.filter((x) => x.completedAt !== null).length;
      const derived = statusFromSessions(updated.sessions.length, done);
      if (derived !== updated.status && derived !== "DONE") {
        return tx.task.update({ where: { id: updated.id }, data: { status: derived }, include: withSessions });
      }
    }
    return updated;
  });
  return res.json({ task: present(task) });
}

export async function deleteTask(req: Request, res: Response) {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Task not found" });
  }

  await prisma.task.delete({ where: { id: existing.id } });
  return res.status(204).send();
}
