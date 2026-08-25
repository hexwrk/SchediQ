import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const taskSchema = z.object({
  title: z.string().min(1),
  deadline: z.coerce.date(),
  durationMin: z.number().int().positive(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["PENDING", "SCHEDULED", "DONE"]).optional(),
  subjectId: z.string().uuid().nullable().optional(),
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

  const task = await prisma.task.update({
    where: { id: existing.id },
    data,
    include: { subject: true },
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
