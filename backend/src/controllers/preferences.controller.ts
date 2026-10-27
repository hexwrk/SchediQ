import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const preferencesSchema = z.object({
  maxDailyMins: z.number().int().positive().optional(),
  preferredStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  preferredEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakMins: z.number().int().nonnegative().optional(),
  clustering: z.boolean().optional(),
});

export async function getPreferences(req: Request, res: Response) {
  const preferences = await prisma.preference.upsert({
    where: { userId: req.userId as string },
    update: {},
    create: { userId: req.userId as string },
  });
  return res.json({ preferences });
}

export async function updatePreferences(req: Request, res: Response) {
  const data = preferencesSchema.parse(req.body);
  const preferences = await prisma.preference.upsert({
    where: { userId: req.userId as string },
    update: data,
    create: { userId: req.userId as string, ...data },
  });
  return res.json({ preferences });
}
