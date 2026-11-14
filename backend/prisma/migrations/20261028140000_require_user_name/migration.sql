-- User.name becomes required.
-- Backfill FIRST: any account created while name was optional gets the local
-- part of its email (e.g. "tristan" for tristan@gmail.com), so the NOT NULL
-- constraint below can never fail on existing rows.
UPDATE "User"
SET "name" = split_part("email", '@', 1)
WHERE "name" IS NULL OR btrim("name") = '';

ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
