import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { validatePassword } from "../../../shared/validation";
import { prisma } from "../lib/prisma";
import { RestoreError, backupStatus, createBackup, restoreBackup } from "../lib/backup";
import { BCRYPT_ROUNDS } from "./auth.controller";

// Super-admin module. Every route here is mounted behind requireAuth AND
// requireSuperAdmin in app.ts; nothing in this file re-checks the role.
//
// These are the ONLY queries in the API that are intentionally not scoped to
// req.userId: managing every account is the point of the admin role.

const userUpdateSchema = z
  .object({
    role: z.enum(["USER", "SUPER_ADMIN"], { message: "Role must be USER or SUPER_ADMIN." }).optional(),
    accountType: z.enum(["FREE", "PREMIUM"], { message: "Tier must be FREE or PREMIUM." }).optional(),
  })
  .refine((v) => v.role !== undefined || v.accountType !== undefined, {
    message: "Nothing to update: send role and/or accountType.",
  });

const idParam = z.string().uuid("Unknown user id.");

// Session counts per user. Sessions hang off tasks, so this joins through Task.
// Tagged-template $queryRaw sends values as bind parameters (no injection).
async function sessionCountsByUser(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ userId: string; count: bigint }[]>`
    SELECT t."userId" AS "userId", COUNT(s.id) AS count
    FROM "StudySession" s JOIN "Task" t ON t.id = s."taskId"
    GROUP BY t."userId"`;
  return new Map(rows.map((r) => [r.userId, Number(r.count)]));
}

// GET /api/admin/users
export async function listUsers(_req: Request, res: Response) {
  const [users, sessionCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      // Explicit select: passwordHash is never returned, even to an admin.
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        accountType: true,
        mustChangePassword: true,
        createdAt: true,
        _count: { select: { tasks: true, subjects: true } },
      },
    }),
    sessionCountsByUser(),
  ]);
  return res.json({
    users: users.map(({ _count, ...u }) => ({
      ...u,
      taskCount: _count.tasks,
      subjectCount: _count.subjects,
      sessionCount: sessionCounts.get(u.id) ?? 0,
    })),
  });
}

// PATCH /api/admin/users/:id  { role?, accountType? }
export async function updateUser(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const data = userUpdateSchema.parse(req.body);

  // An admin demoting themselves could leave the system with no admin and no
  // way back in from the UI, so self role changes are refused.
  if (id === req.userId && data.role !== undefined && data.role !== "SUPER_ADMIN") {
    return res.status(400).json({ error: "You cannot remove your own super admin role." });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, accountType: true },
  });
  return res.json({ user });
}

// DELETE /api/admin/users/:id
// Cascades to the user's subjects, tasks, sessions and preferences (schema
// onDelete: Cascade).
export async function deleteUser(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  if (id === req.userId) {
    return res.status(400).json({ error: "You cannot delete your own account from the admin panel." });
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }
  await prisma.user.delete({ where: { id } });
  return res.status(204).send();
}

// ---------- Admin password reset ----------
//
// The account-recovery path that works without email: the admin issues a
// temporary password, sees it ONCE, and passes it to the user out of band. The
// user is then asked to choose their own (mustChangePassword).

// No look-alike characters (0/O, 1/l/I) so it can be read out or retyped.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TEMP_GROUPS = 4;
const TEMP_GROUP_LEN = 4;

// crypto.randomInt is a CSPRNG with no modulo bias. 16 chars from 31 symbols is
// ~79 bits: far beyond online guessing, and the password is short-lived anyway.
// Regenerated until it meets the shared password rule (needs a letter and a
// digit), which almost every draw already does.
export function temporaryPassword(): string {
  for (;;) {
    const groups = Array.from({ length: TEMP_GROUPS }, () =>
      Array.from({ length: TEMP_GROUP_LEN }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join("")
    );
    const pw = groups.join("-");
    if (validatePassword(pw) === null) return pw;
  }
}

// POST /api/admin/users/:id/reset-password
export async function resetUserPassword(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  // An admin changes their own password on the Account page (which checks the
  // current one); this route is for recovering OTHER accounts.
  if (id === req.userId) {
    return res.status(400).json({ error: "Change your own password on the Account page." });
  }
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  const temp = temporaryPassword();
  const passwordHash = await bcrypt.hash(temp, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
    // Any reset link already sent for this account stops working.
    prisma.passwordResetToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  // Audit line WITHOUT the password: who reset whom, and when (log timestamp).
  console.log(`[admin] ${await actorEmail(req.userId)} issued a temporary password for ${existing.email}`);

  // Shown once. no-store keeps it out of browser and proxy caches.
  res.setHeader("Cache-Control", "no-store");
  return res.json({ email: existing.email, temporaryPassword: temp });
}

// GET /api/admin/stats
export async function getStats(_req: Request, res: Response) {
  const [users, tasks, sessions, completedSessions, subjects, byRole, byTier, size, lastBackup, lastRestore, backup] =
    await Promise.all([
      prisma.user.count(),
      prisma.task.count(),
      prisma.studySession.count(),
      prisma.studySession.count({ where: { completedAt: { not: null } } }),
      prisma.subject.count(),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.groupBy({ by: ["accountType"], _count: { _all: true } }),
      prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
      prisma.backupLog.findFirst({ where: { kind: "BACKUP" }, orderBy: { createdAt: "desc" } }),
      prisma.backupLog.findFirst({ where: { kind: "RESTORE" }, orderBy: { createdAt: "desc" } }),
      backupStatus(),
    ]);

  return res.json({
    counts: { users, tasks, sessions, completedSessions, subjects },
    usersByRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])),
    usersByTier: Object.fromEntries(byTier.map((r) => [r.accountType, r._count._all])),
    // pg_database_size returns bigint; a student DB is far below 2^53 bytes.
    databaseSizeBytes: Number(size[0]?.bytes ?? 0),
    lastBackup,
    lastRestore,
    backup,
    generatedAt: new Date().toISOString(),
  });
}

async function actorEmail(userId: string | undefined): Promise<string> {
  if (!userId) return "unknown";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return u?.email ?? "unknown";
}

// POST /api/admin/backup
// Responds with the backup file itself as an attachment download.
export async function createBackupHandler(req: Request, res: Response) {
  const status = await backupStatus();
  if (!status.enabled) {
    return res.status(409).json({ error: status.message, code: "BACKUP_DISABLED" });
  }
  const backup = await createBackup();

  // Logged AFTER the dump, so a backup never contains its own log entry.
  await prisma.backupLog.create({
    data: {
      kind: "BACKUP",
      format: backup.format,
      filename: backup.filename,
      sizeBytes: backup.data.length,
      actorEmail: await actorEmail(req.userId),
    },
  });

  res.setHeader("Content-Type", backup.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${backup.filename}"`);
  res.setHeader("Content-Length", String(backup.data.length));
  res.setHeader("X-Backup-Format", backup.format);
  if (backup.fallbackReason) res.setHeader("X-Backup-Fallback", backup.fallbackReason);
  // Backups contain password hashes: never let a proxy or browser cache them.
  res.setHeader("Cache-Control", "no-store");
  return res.send(backup.data);
}

// POST /api/admin/restore  (multipart, field "file")
// DESTRUCTIVE and admin-only: replaces the whole database with the upload.
// The UI makes the admin type RESTORE first; the server additionally requires
// confirm=RESTORE in the form body so a stray request cannot trigger it.
export async function restoreHandler(req: Request, res: Response) {
  const status = await backupStatus();
  if (!status.enabled) {
    return res.status(409).json({ error: status.message, code: "BACKUP_DISABLED" });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Choose a backup file to restore." });
  }
  if (req.body?.confirm !== "RESTORE") {
    return res.status(400).json({ error: "Type RESTORE to confirm this destructive action." });
  }

  // Captured before the restore: the admin's own row may not exist afterwards.
  const actor = await actorEmail(req.userId);
  // The audit trail must outlive a restore. The backup file only holds the log
  // as it was when the dump ran (never its own BACKUP entry), so snapshot the
  // current log and re-insert anything the restore dropped.
  const auditLog = await prisma.backupLog.findMany();

  try {
    const format = await restoreBackup(file.originalname, file.buffer);
    await prisma.backupLog.createMany({ data: auditLog, skipDuplicates: true });
    await prisma.backupLog.create({
      data: {
        kind: "RESTORE",
        format,
        filename: file.originalname.slice(0, 200),
        sizeBytes: file.size,
        actorEmail: actor,
      },
    });
    return res.json({ ok: true, format, restoredFrom: file.originalname });
  } catch (err) {
    if (err instanceof RestoreError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

// GET /api/admin/data-model
// Read-only "how it links together" view for presentations: each entity, what
// it is for, how it relates to the others, and its live row count.
export async function getDataModel(_req: Request, res: Response) {
  const [users, subjects, tasks, sessions, preferences, courses, lessons] = await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.task.count(),
    prisma.studySession.count(),
    prisma.preference.count(),
    prisma.course.count(),
    prisma.lesson.count(),
  ]);

  const entities = [
    {
      name: "User",
      rows: users,
      purpose: "An account: credentials (bcrypt hash), role (USER / SUPER_ADMIN) and tier (FREE / PREMIUM).",
      relations: ["has many Subjects", "has many Tasks", "has many Courses", "has one Preference"],
    },
    {
      name: "Subject",
      rows: subjects,
      purpose: "A module the student studies, with a cognitive category used by the scheduler's clustering.",
      relations: ["belongs to a User", "groups many Tasks", "groups many Courses (mastery roll-up)"],
    },
    {
      name: "Task",
      rows: tasks,
      purpose: "A piece of work with a deadline, duration and priority. Input to the deterministic scheduler.",
      relations: ["belongs to a User", "optionally belongs to a Subject", "optionally created from a Lesson", "is split into many StudySessions"],
    },
    {
      name: "StudySession",
      rows: sessions,
      purpose: "A scheduled study block on the calendar. Completing one earns study XP.",
      relations: ["belongs to a Task (and so, via the Task, to a User and Subject)"],
    },
    {
      name: "Preference",
      rows: preferences,
      purpose: "Scheduling rules: daily minute cap, study window, break length, clustering on/off.",
      relations: ["belongs to exactly one User"],
    },
    {
      name: "Course",
      rows: courses,
      purpose: "A generated learning course (AI or offline SEED templates).",
      relations: ["belongs to a User", "optionally rolls up into a Subject", "has many Lessons"],
    },
    {
      name: "Lesson",
      rows: lessons,
      purpose: "One lesson: explanation, key points and a graded multiple-choice quiz. Completion and quiz score earn XP.",
      relations: ["belongs to a Course", "optionally linked to one Task (Add to schedule)"],
    },
  ];

  const flows = [
    "Plan: Tasks + Preference -> scheduler -> StudySessions on the calendar.",
    "Learn: topic -> course generator -> Course with Lessons, linked to a Subject.",
    "Connect: 'Add to schedule' turns each Lesson into a Task, so learning is planned like any other work.",
    "Progress: completed StudySessions, Lessons and quiz scores -> XP, level, streak, badges and per-Subject mastery (all derived, never stored).",
  ];

  return res.json({ entities, flows, generatedAt: new Date().toISOString() });
}
