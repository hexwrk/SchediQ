import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { aiUsageFor } from "../lib/tier";
import { toPublicUser } from "./auth.controller";

const tierSchema = z.object({
  accountType: z.enum(["FREE", "PREMIUM"], { message: "Tier must be FREE or PREMIUM." }),
});

// GET /api/account
// The caller's own profile plus today's AI parse usage for the tier badge and
// the Add task / Upgrade pages.
export async function getAccount(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const usage = await aiUsageFor(user.id, user.accountType);
  return res.json({ user: toPublicUser(user), usage: { aiParses: usage } });
}

// PATCH /api/account/tier
// DEMO UPGRADE: flips the caller's own tier with no payment. Scoped to
// req.userId, so a user can only ever change their own tier; changing someone
// else's tier is an admin action under /api/admin/users.
export async function updateTier(req: Request, res: Response) {
  const { accountType } = tierSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { accountType },
  });
  const usage = await aiUsageFor(user.id, user.accountType);
  return res.json({ user: toPublicUser(user), usage: { aiParses: usage } });
}
