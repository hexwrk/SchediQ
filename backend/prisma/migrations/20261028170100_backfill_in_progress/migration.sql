-- Separate migration on purpose: Postgres cannot use an enum value in the same
-- transaction that added it. Tasks that already have some (but not all) of
-- their study sessions completed become IN_PROGRESS.
UPDATE "Task" t
SET "status" = 'IN_PROGRESS'
WHERE t."status" <> 'DONE'
  AND EXISTS (SELECT 1 FROM "StudySession" s WHERE s."taskId" = t.id AND s."completedAt" IS NOT NULL)
  AND EXISTS (SELECT 1 FROM "StudySession" s WHERE s."taskId" = t.id AND s."completedAt" IS NULL);
