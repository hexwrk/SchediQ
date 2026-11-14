-- Off-site backups: where each backup went. Existing rows were all browser
-- downloads, so the default backfills them as "local".
ALTER TABLE "BackupLog" ADD COLUMN "destination" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "driveFileId" TEXT,
ADD COLUMN "driveLink" TEXT;

-- CreateIndex
CREATE INDEX "BackupLog_kind_destination_createdAt_idx" ON "BackupLog"("kind", "destination", "createdAt");
