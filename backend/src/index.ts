import "dotenv/config";
import { loadEnv } from "./lib/env";
import { createApp } from "./app";
import { startBackupSchedule } from "./lib/backupSchedule";
import { prisma } from "./lib/prisma";

// Validate configuration before listening: a bad deploy fails here, loudly,
// with every problem listed (see lib/env.ts).
const config = loadEnv();
const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`SchediQ API listening on :${config.PORT} (${config.NODE_ENV}, AI_PARSER=${config.AI_PARSER}, DEMO_MODE=${config.DEMO_MODE})`);
});

// No-op unless cloud storage (S3_*) AND BACKUP_SCHEDULE are both configured.
const backupTask = startBackupSchedule();

// Render sends SIGTERM on every deploy/restart: stop taking connections, let
// in-flight requests finish, then release the database pool. Production only,
// so the dev watcher's fast restarts are untouched.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  backupTask?.stop();
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  // Hard stop if a keep-alive connection holds the server open.
  setTimeout(() => process.exit(0), 10_000).unref();
}
if (config.NODE_ENV === "production") {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
