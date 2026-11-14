-- Off-site backups moved from Google Drive to S3-compatible object storage.
-- objectKey holds the bucket key (backups/<file>.gz). The Drive columns stay
-- so rows written by the old Drive uploader keep their history.
ALTER TABLE "BackupLog" ADD COLUMN "objectKey" TEXT;
