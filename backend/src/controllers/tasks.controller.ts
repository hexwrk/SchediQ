import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { deadlineField, intField, titleField } from "../lib/validators";

// Field rules (title length, deadline sanity, 5-600 minute duration) are the
// shared ones the task forms enforce client-side.
const taskSchema = z.object({
  title: titleField,
  deadline: deadlineField,
  durationMin: intField("durationMin"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"], { message: "Priority must be LOW, MEDIUM or HIGH." }).optional(),
  status: z.enum(["PENDING", "SCHEDULED", "DONE"]).optional(),
  subjectId: z.string().uuid("Unknown subject.").nullable().optional(),
});

export async function listTasks(req: Request, res: Response) {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId },
    orderBy: { deadline: "asc" },
    include: { subject: true },
  });
  return res.json({ tasks });
}

export async function getTask(req: Request, res: Response) {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
    include: { subject: true },
  });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.json({ task });
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
    include: { subject: true },
  });
  return res.status(201).json({ task });
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
      include: { subject: true },
    });
    // Ticking a lesson-linked task DONE completes its lesson (same rule as
    // finishing its study blocks), keeping one progress system.
    if (data.status === "DONE" && updated.lessonId) {
      await tx.lesson.updateMany({
        where: { id: updated.lessonId, completedAt: null },
        data: { completedAt: new Date() },
      });
    }
    return updated;
  });
  return res.json({ task });
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
