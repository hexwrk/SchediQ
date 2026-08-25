import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const subjectSchema = z.object({
  name: z.string().min(1),
  cognitiveCategory: z.string().min(1),
  colorTag: z.string().min(1).optional(),
});

export async function listSubjects(req: Request, res: Response) {
  const subjects = await prisma.subject.findMany({
    where: { userId: req.userId },
    orderBy: { name: "asc" },
  });
  return res.json({ subjects });
}

export async function createSubject(req: Request, res: Response) {
  const data = subjectSchema.parse(req.body);
  const subject = await prisma.subject.create({
    data: { ...data, userId: req.userId as string },
  });
  return res.status(201).json({ subject });
}

export async function updateSubject(req: Request, res: Response) {
  const data = subjectSchema.partial().parse(req.body);

  const existing = await prisma.subject.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Subject not found" });
  }

  const subject = await prisma.subject.update({ where: { id: existing.id }, data });
  return res.json({ subject });
}

export async function deleteSubject(req: Request, res: Response) {
  const existing = await prisma.subject.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Subject not found" });
  }

  await prisma.subject.delete({ where: { id: existing.id } });
  return res.status(204).send();
}
