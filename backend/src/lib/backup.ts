import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { prisma } from "./prisma";

// System backup / restore for the super-admin System page.
//
// Two formats, chosen automatically:
//   - sql : a real `pg_dump` of the database (preferred). Restorable with psql.
//   - json: a logical export of every table read through Prisma. Used when
//           pg_dump is not installed or cannot reach the server (e.g. version
//           mismatch), so the "Create backup" button always produces a file.
//
// Child processes are started with execFile and an ARGUMENT ARRAY, never a
// shell string, so nothing from DATABASE_URL or an upload is ever parsed by a
// shell. The DB password goes in the child's environment (PGPASSWORD), not on
// the command line, because argv is world-readable via `ps` / /proc/<pid>/cmdline.

const execFileAsync = promisify(execFile);

// Dumps are buffered in memory so a pg_dump failure can still fall back to JSON
// before any bytes are sent. 256 MB is far above a student-scale database.
const MAX_DUMP_BYTES = 256 * 1024 * 1024;
const CHILD_TIMEOUT_MS = 120_000;

export type BackupFormat = "sql" | "json";

export interface BackupFile {
  format: BackupFormat;
  filename: string;
  contentType: string;
  data: Buffer;
  // Why the JSON fallback was used, when it was. Surfaced to the admin.
  fallbackReason?: string;
}

interface PgConn {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// Split DATABASE_URL into libpq parts. WHATWG URL handles percent-encoded
// passwords, so decode them before handing them to PGPASSWORD.
function pgConn(): PgConn {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

// Minimal child environment: PATH to find the binary, PGPASSWORD for auth.
// Not spreading process.env keeps JWT_SECRET / OPENAI_API_KEY out of the child.
function pgEnv(conn: PgConn): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    PGPASSWORD: conn.password,
    PGCONNECT_TIMEOUT: "10",
  };
}

function connArgs(conn: PgConn): string[] {
  return ["--host", conn.host, "--port", conn.port, "--username", conn.user, "--dbname", conn.database];
}

function timestamp(now: Date): string {
  // 2026-10-28T09-15-02Z: filesystem-safe (no colons) and sorts chronologically.
  return now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

async function pgDump(conn: PgConn): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    process.env.PG_DUMP_PATH || "pg_dump",
    [
      ...connArgs(conn),
      "--format=plain",
      // --clean --if-exists makes the dump self-contained for restore: it drops
      // each object before recreating it, so it can be replayed over a live DB.
      "--clean",
      "--if-exists",
      // Ownership/grants reference roles that may not exist on the restore
      // target; leaving them out keeps the dump portable.
      "--no-owner",
      "--no-privileges",
      "--encoding=UTF8",
    ],
    { env: pgEnv(conn), encoding: "buffer", maxBuffer: MAX_DUMP_BYTES, timeout: CHILD_TIMEOUT_MS }
  );
  return stdout;
}

// Table export order = dependency order (parents first). Restore inserts in
// this order and deletes in reverse, so foreign keys are always satisfied.
// Task comes after lesson because Task.lessonId references Lesson.
const TABLES = [
  "user",
  "preference",
  "subject",
  "course",
  "lesson",
  "task",
  "studySession",
  "aiParseLog",
  "backupLog",
] as const;
type TableKey = (typeof TABLES)[number];

async function jsonExport(now: Date): Promise<Buffer> {
  const [user, preference, subject, course, lesson, task, studySession, aiParseLog, backupLog] = await Promise.all([
    prisma.user.findMany(),
    prisma.preference.findMany(),
    prisma.subject.findMany(),
    prisma.course.findMany(),
    prisma.lesson.findMany(),
    prisma.task.findMany(),
    prisma.studySession.findMany(),
    prisma.aiParseLog.findMany(),
    prisma.backupLog.findMany(),
  ]);
  // NOTE: includes bcrypt password hashes so a restore yields working logins.
  // The file is therefore sensitive and must be stored like the database itself.
  const payload = {
    format: "schediq-json",
    version: 1,
    createdAt: now.toISOString(),
    tables: { user, preference, subject, course, lesson, task, studySession, aiParseLog, backupLog },
  };
  return Buffer.from(JSON.stringify(payload, null, 2), "utf8");
}

// Produce a backup file. BACKUP_MODE=json forces the logical export (handy on a
// host without pg_dump); the default "auto" tries pg_dump first.
export async function createBackup(now = new Date()): Promise<BackupFile> {
  const mode = process.env.BACKUP_MODE ?? "auto";
  let fallbackReason: string | undefined;

  if (mode !== "json") {
    try {
      const data = await pgDump(pgConn());
      if (data.length === 0) throw new Error("pg_dump produced no output");
      return {
        format: "sql",
        filename: `schediq-backup-${timestamp(now)}.sql`,
        contentType: "application/sql",
        data,
      };
    } catch (err) {
      // ENOENT = binary missing; otherwise connection/version errors. Log the
      // detail server-side, give the admin a short reason.
      const e = err as NodeJS.ErrnoException & { stderr?: Buffer };
      fallbackReason =
        e.code === "ENOENT" ? "pg_dump not installed on the API host" : "pg_dump failed";
      console.error("pg_dump failed, falling back to JSON export:", e.stderr?.toString() || e.message);
    }
  } else {
    fallbackReason = "BACKUP_MODE=json";
  }

  return {
    format: "json",
    filename: `schediq-backup-${timestamp(now)}.json`,
    contentType: "application/json",
    data: await jsonExport(now),
    fallbackReason,
  };
}

// ---------- Restore (DESTRUCTIVE) ----------

export class RestoreError extends Error {}

// pg_dump's plain format always opens with this banner. Requiring it rejects
// arbitrary .sql scripts that were not produced by a dump. It is a sanity check,
// not a security boundary: the real control is that only a SUPER_ADMIN can
// reach this code (see SECURITY.md).
const PG_DUMP_BANNER = "-- PostgreSQL database dump";

async function restoreSql(data: Buffer): Promise<void> {
  const head = data.subarray(0, 512).toString("utf8");
  if (!head.includes(PG_DUMP_BANNER)) {
    throw new RestoreError("This .sql file is not a SchediQ pg_dump backup.");
  }
  const conn = pgConn();
  // --single-transaction + ON_ERROR_STOP: the whole dump applies or nothing
  // does, so a bad file cannot leave the database half-restored.
  const run = execFileAsync(
    process.env.PSQL_PATH || "psql",
    [...connArgs(conn), "--no-psqlrc", "--quiet", "--single-transaction", "-v", "ON_ERROR_STOP=1", "--file", "-"],
    { env: pgEnv(conn), maxBuffer: 16 * 1024 * 1024, timeout: CHILD_TIMEOUT_MS }
  );
  // The dump is piped over stdin, so no temp file with DB contents hits disk.
  run.child.stdin?.end(data);
  try {
    await run;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") {
      throw new RestoreError("psql is not installed on the API host; restore a .json backup instead.");
    }
    console.error("psql restore failed:", e.stderr || e.message);
    throw new RestoreError("psql rejected the backup; nothing was changed (single transaction).");
  }
}

const jsonBackupSchema = z.object({
  format: z.literal("schediq-json"),
  version: z.literal(1),
  tables: z.object(
    Object.fromEntries(TABLES.map((t) => [t, z.array(z.record(z.string(), z.unknown()))])) as Record<
      TableKey,
      z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>
    >
  ),
});

// Prisma delegates are not indexable by a string key with full typing, so the
// importer goes through this small table of typed operations instead.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Rows = Record<string, unknown>[];
const importers: Record<TableKey, { wipe: (tx: Tx) => Promise<unknown>; load: (tx: Tx, rows: Rows) => Promise<unknown> }> = {
  user: { wipe: (tx) => tx.user.deleteMany(), load: (tx, rows) => tx.user.createMany({ data: rows as never }) },
  preference: { wipe: (tx) => tx.preference.deleteMany(), load: (tx, rows) => tx.preference.createMany({ data: rows as never }) },
  subject: { wipe: (tx) => tx.subject.deleteMany(), load: (tx, rows) => tx.subject.createMany({ data: rows as never }) },
  course: { wipe: (tx) => tx.course.deleteMany(), load: (tx, rows) => tx.course.createMany({ data: rows as never }) },
  lesson: { wipe: (tx) => tx.lesson.deleteMany(), load: (tx, rows) => tx.lesson.createMany({ data: rows as never }) },
  task: { wipe: (tx) => tx.task.deleteMany(), load: (tx, rows) => tx.task.createMany({ data: rows as never }) },
  studySession: { wipe: (tx) => tx.studySession.deleteMany(), load: (tx, rows) => tx.studySession.createMany({ data: rows as never }) },
  aiParseLog: { wipe: (tx) => tx.aiParseLog.deleteMany(), load: (tx, rows) => tx.aiParseLog.createMany({ data: rows as never }) },
  backupLog: { wipe: (tx) => tx.backupLog.deleteMany(), load: (tx, rows) => tx.backupLog.createMany({ data: rows as never }) },
};

async function restoreJson(data: Buffer): Promise<void> {
  let parsed: z.infer<typeof jsonBackupSchema>;
  try {
    parsed = jsonBackupSchema.parse(JSON.parse(data.toString("utf8")));
  } catch {
    throw new RestoreError("This .json file is not a SchediQ backup.");
  }
  try {
    // One transaction: wipe children-first, then insert parents-first. Prisma
    // rejects unknown columns, so a tampered file fails and rolls back whole.
    await prisma.$transaction(
      async (tx) => {
        for (const t of [...TABLES].reverse()) await importers[t].wipe(tx);
        for (const t of TABLES) {
          const rows = parsed.tables[t];
          if (rows.length > 0) await importers[t].load(tx, rows);
        }
      },
      { timeout: 60_000 }
    );
  } catch (err) {
    console.error("JSON restore failed:", err);
    throw new RestoreError("The backup contents were rejected by the database; nothing was changed.");
  }
}

// Replace the ENTIRE database with the uploaded backup. Admin-only and
// irreversible: every user, task and session not in the file is gone.
export async function restoreBackup(filename: string, data: Buffer): Promise<BackupFormat> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".sql")) {
    await restoreSql(data);
    return "sql";
  }
  if (lower.endsWith(".json")) {
    await restoreJson(data);
    return "json";
  }
  throw new RestoreError("Upload a .sql or .json SchediQ backup file.");
}
