-- User.username: required, unique, 3-20 chars [a-z0-9_], starting with a letter.
--
-- Order matters so this can never fail on existing rows:
--   1. add the column NULLABLE,
--   2. backfill every row with a VALID, UNIQUE name derived from the email,
--   3. only then enforce NOT NULL and the unique index.

-- 1.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- 2. Row by row in signup order, so the oldest account keeps the plain name
-- and later ones get a numeric suffix. A loop (not row_number()) because a
-- generated "john2" can collide with a real user whose email is john2@...
DO $$
DECLARE
  -- Mirrors RESERVED_USERNAMES in shared/validation.ts (a test keeps them in
  -- sync). A user whose email name is reserved gets a suffix, e.g. admin1.
  reserved TEXT[] := ARRAY[
    'admin', 'administrator', 'root', 'system', 'sysadmin', 'superuser', 'api', 'support', 'help',
    'staff', 'moderator', 'mod', 'owner', 'security', 'schediq', 'official', 'null', 'undefined',
    'anonymous', 'guest', 'user', 'users', 'account', 'login', 'logout', 'register', 'signup',
    'settings', 'dashboard', 'reports', 'me', 'test', 'www', 'mail', 'noreply', 'postmaster'
  ];
  r RECORD;
  base TEXT;
  candidate TEXT;
  suffix TEXT;
  n INT;
BEGIN
  FOR r IN SELECT "id", "email" FROM "User" WHERE "username" IS NULL ORDER BY "createdAt", "id" LOOP
    -- Local part, lower-cased, without a +tag; anything outside [a-z0-9_]
    -- becomes "_" (first.last -> first_last).
    base := regexp_replace(lower(split_part(split_part(r."email", '@', 1), '+', 1)), '[^a-z0-9_]', '_', 'g');
    -- Must start with a letter.
    IF base !~ '^[a-z]' THEN
      base := 'u' || base;
    END IF;
    base := left(base, 20);
    -- Pad very short names up to the 3-char minimum.
    IF length(base) < 3 THEN
      base := rpad(base, 3, '0');
    END IF;

    candidate := base;
    n := 0;
    WHILE candidate = ANY(reserved) OR EXISTS (SELECT 1 FROM "User" WHERE "username" = candidate) LOOP
      n := n + 1;
      suffix := n::TEXT;
      -- Truncate the base so name + suffix still fits in 20 characters.
      candidate := left(base, 20 - length(suffix)) || suffix;
    END LOOP;

    UPDATE "User" SET "username" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

-- 3.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
