import cron, { ScheduledTask } from "node-cron";
import { createCloudBackup } from "./backup";
import { env, storageConfigured } from "./env";
import { StorageError } from "./objectStorage";

// Optional automatic cloud backup. Off unless BOTH object storage is
// configured and BACKUP_SCHEDULE is set, so a fresh install never schedules
// anything.
//
// Caveats (also in docs/CLOUD_BACKUP.md): the job runs inside the API
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
  if (!storageConfigured()) {
    console.warn("[backup] BACKUP_SCHEDULE is set but cloud storage (S3_*) is not configured; scheduled backups are off.");
    return null;
  }
  const expression = scheduleExpression(raw);
  const task = cron.schedule(expression, async () => {
    // A slow upload must not overlap the next tick.
    if (running) return;
    running = true;
    try {
      const r = await createCloudBackup("scheduled-backup");
      // Key and size only: the presigned URL is a bearer link and stays out of logs.
      console.log(`[backup] Scheduled cloud backup uploaded: ${r.objectKey} (${r.sizeBytes} bytes)`);
    } catch (err) {
      // StorageError messages are already safe; anything else is logged as its
      // message only (never the object, which may carry request config).
      const message = err instanceof StorageError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[backup] Scheduled cloud backup failed: ${message}`);
    } finally {
      running = false;
    }
  });
  console.log(`[backup] Scheduled cloud backups enabled (${expression}, server time).`);
  return task;
}
