import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { tokenFor } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { aiUsageFor } from "../lib/tier";
import { passwordFieldFor } from "../lib/validators";
import { BCRYPT_ROUNDS, toPublicUser } from "./auth.controller";

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

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  // Shape only here; the full rules need the account's username and email,
  // so they run after the user is loaded.
  newPassword: z.string({ message: "Enter a new password." }).max(200),
});

// POST /api/account/password  { currentPassword, newPassword }
// Self-service password change (also how an admin-issued temporary password
// is replaced). Re-checks the current password so a stolen token alone cannot
// take over the account, then burns any outstanding reset links and revokes
// every existing token (tokenVersion++). The caller gets a fresh token so this
// device stays signed in; every other device must log in again.
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  // One message per failing rule under newPassword (ZodError -> 400).
  z.object({ newPassword: passwordFieldFor(user) }).parse({ newPassword });

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({
      error: "Current password is incorrect.",
      details: { fieldErrors: { currentPassword: ["Current password is incorrect."] } },
    });
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return res.status(400).json({
      error: "Choose a password different from the current one.",
      details: { fieldErrors: { newPassword: ["Choose a password different from the current one."] } },
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  return res.json({
    token: tokenFor(updated),
    user: toPublicUser(updated),
    message: "Password changed. Other devices have been signed out.",
  });
}

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
  confirm: z.literal("DELETE", { message: "Type DELETE to confirm." }),
});

// DELETE /api/account  { password, confirm: "DELETE" }
// Self-service account deletion. Re-authenticates with the password (a stolen
// token alone cannot wipe an account) and cascades to subjects, tasks,
// sessions, courses, lessons and preferences via the schema's onDelete rules.
export async function deleteAccount(req: Request, res: Response) {
  const { password } = deleteSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(400).json({
      error: "Password is incorrect.",
      details: { fieldErrors: { password: ["Password is incorrect."] } },
    });
  }
  // Never leave the system without an administrator.
  if (user.role === "SUPER_ADMIN") {
    const admins = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (admins <= 1) {
      return res.status(400).json({ error: "You are the only super admin. Promote another admin before deleting this account." });
    }
  }
  await prisma.user.delete({ where: { id: user.id } });
  return res.status(204).send();
}
