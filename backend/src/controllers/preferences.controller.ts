import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hhmmField, intField } from "../lib/validators";
import { validateTimeWindow } from "../../../shared/validation";

const preferencesSchema = z
  .object({
    maxDailyMins: intField("maxDailyMins").optional(),
    preferredStart: hhmmField("Preferred start").optional(),
    preferredEnd: hhmmField("Preferred end").optional(),
    breakMins: intField("breakMins").optional(),
    clustering: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    // Only checkable when both ends arrive together (the form always sends both).
    if (v.preferredStart && v.preferredEnd) {
      const message = validateTimeWindow(v.preferredStart, v.preferredEnd);
      if (message) ctx.addIssue({ code: "custom", message, path: ["preferredEnd"] });
    }
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
