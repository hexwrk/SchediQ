import cron, { ScheduledTask } from "node-cron";
import { createDriveBackup } from "./backup";
import { driveConfigured, env } from "./env";
import { DriveError } from "./googleDrive";

// Optional automatic Drive backup. Off unless BOTH Google Drive is configured
// and BACKUP_SCHEDULE is set, so a fresh install never schedules anything.
//
// Caveats (also in docs/GOOGLE_DRIVE_BACKUP.md): the job runs inside the API
// process, so a host that sleeps when idle (Render free tier) skips runs while
// asleep, and N API instances would each run it. For one small instance that
// trade-off is fine; at scale use an external scheduler hitting the endpoint.

export const DAILY_CRON = "0 3 * * *";

export function scheduleExpression(raw: string): string {
  return raw.trim().toLowerCase() === "daily" ? DAILY_CRON : raw.trim();
}

let running = false;

export function startBackupSchedule(): ScheduledTask | null {
  const raw = env().BACKUP_SCHEDULE;
  if (!raw) return null;
  if (!driveConfigured()) {
    console.warn("[backup] BACKUP_SCHEDULE is set but Google Drive is not configured; scheduled backups are off.");
    return null;
  }
  const expression = scheduleExpression(raw);
  const task = cron.schedule(expression, async () => {
    // A slow upload must not overlap the next tick.
    if (running) return;
    running = true;
    try {
      const r = await createDriveBackup("scheduled-backup");
      console.log(`[backup] Scheduled Drive backup uploaded: ${r.filename} (${r.sizeBytes} bytes)`);
    } catch (err) {
      // DriveError messages are already safe; anything else is logged as its
      // message only (never the object, which may carry request config).
      const message = err instanceof DriveError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[backup] Scheduled Drive backup failed: ${message}`);
    } finally {
      running = false;
    }
  });
  console.log(`[backup] Scheduled Drive backups enabled (${expression}, server time).`);
  return task;
}
