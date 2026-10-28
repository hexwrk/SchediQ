# SchediQ: Security model

This page summarises how SchediQ handles authentication, authorisation, data
isolation and input. Each control names the file where it lives so it can be
shown in code.

## 1. Passwords: bcrypt, 12 rounds

- Passwords are hashed with bcrypt at cost 12 (`BCRYPT_ROUNDS` in
  `backend/src/controllers/auth.controller.ts`). Each extra round doubles the
  work, and 12 takes roughly 200-300 ms per hash. That is unnoticeable at login
  but makes offline cracking of a leaked hash expensive. bcrypt salts every hash,
  so identical passwords produce different hashes and rainbow tables do not work.
- The password rule is 8-72 characters with at least one letter and one number.
  The cap is 72 because bcrypt ignores input beyond 72 bytes; a longer password
  would only look stronger.
- Plain-text passwords are never stored or logged. `passwordHash` is excluded
  from every API response by explicit allow-list (`toPublicUser`, and the admin
  `select`). Even the admin user list never returns it.

## 2. Login hardening

- An unknown email and a wrong password both get the same `401 Invalid email or
  password`, so the endpoint cannot be used to discover which emails are
  registered.
- For an unknown email the server still runs a bcrypt compare against a dummy
  hash, so response time does not reveal whether the account exists.
- Emails are stored lower-cased and matched case-insensitively, so
  `Tristan@Gmail.com` and `tristan@gmail.com` cannot be two different accounts.

## 2b. Forgot password (DEMO MODE) and account deletion

- `POST /api/auth/forgot` always answers with the same generic message, whether
  or not the email is registered, so it cannot be used to enumerate accounts.
- The reset token is 32 random bytes (256 bits, `crypto.randomBytes`), sent only
  in the link. The database stores its **SHA-256 hash**, so a leaked
  `PasswordResetToken` row cannot be turned into a working link. A fast hash is
  fine here (unlike passwords) because a 256-bit random value cannot be brute-forced.
- Tokens expire after **30 minutes** and are **single use**. Requesting a new link,
  or using one, burns every other outstanding link for that account.
- The new password goes through the same shared validator and bcrypt (12 rounds).
- **Demo mode (documented limitation):** there is no email service, so the API
  returns the reset link in the response and logs it as `[demo mail] ...`. That
  is only acceptable locally: it hands the link to whoever submits the form,
  which in production would allow account takeover by email address. It is on by
  default only when `NODE_ENV` is not `production`; `RESET_DEMO_MODE=false` turns
  it off (the link is then only logged, ready to be swapped for a real mailer).
- `DELETE /api/account` requires the **current password** (a stolen token alone
  cannot destroy an account) plus `confirm: "DELETE"`. It cascades to all owned
  rows. The last remaining SUPER_ADMIN cannot delete themselves.

## 3. Sessions: JWT bearer tokens

- On login or register the API signs a JWT containing only `{ userId }`, with
  `JWT_SECRET` from the environment (the server refuses to start without it) and
  an expiry of `JWT_EXPIRES_IN` (default 7 days). See `backend/src/lib/jwt.ts`.
- Every data route uses `requireAuth`
  (`backend/src/middleware/auth.middleware.ts`), which verifies the signature and
  expiry and sets `req.userId`. Missing or invalid tokens get `401`.
- The token is sent as `Authorization: Bearer`, not as a cookie, so classic CSRF
  does not apply. Known trade-off: the frontend keeps it in `localStorage`, where
  an XSS bug could read it. React escapes output by default and no raw HTML is
  rendered. An httpOnly cookie plus CSRF tokens would be the production upgrade.

## 4. Per-user data isolation

Every query for user data is scoped to the authenticated user:

- Lists filter with `where: { userId: req.userId }` (subjects, tasks, courses),
  or through the owning relation (`task: { userId }` for sessions,
  `course: { userId }` for lessons).
- Reads, updates and deletes of a single record use `findFirst({ id, userId })`
  first and return `404` if it is not yours. A guessed or enumerated ID (IDOR)
  reveals nothing and changes nothing.
- Cross-references are re-checked: a task's `subjectId` or a course's
  `subjectId` must belong to the same user, or the request is rejected.
- `PATCH /api/account/tier` only ever changes the caller's own account.
- The only intentionally unscoped queries are in
  `backend/src/controllers/admin.controller.ts`, behind the admin gate below.
  The leaderboard reads other users' derived XP and display names only.

## 5. Role-based admin gate

- `User.role` is `USER` or `SUPER_ADMIN`. Every `/api/admin/*` route is mounted
  as `requireAuth, requireSuperAdmin, adminRoutes` in `backend/src/app.ts`.
- `requireSuperAdmin` (`backend/src/middleware/admin.middleware.ts`) loads the
  role from the database on every request rather than trusting a claim in the
  JWT. Demoting an admin or deleting their account takes effect on their very
  next request, not when their 7-day token expires.
- A non-admin gets `403 Access denied`. The frontend hides the admin nav for
  non-admins and shows an "Access denied" page if `/admin` is opened directly.
  That is UX only; the server enforces the rule independently.
- Lock-out guards: an admin cannot remove their own SUPER_ADMIN role or delete
  their own account from the panel.

## 6. Input validation

- One rule file, `shared/validation.ts`, is used by both the frontend (inline
  errors, submit blocked) and the backend (zod schemas in
  `backend/src/lib/validators.ts`). The server never trusts the client: every
  body is parsed by zod, and failures return `400` with per-field messages
  through the central `errorHandler`.
- Enums (priority, status, role, tier, level, cognitive category) are closed
  lists. Numbers have min and max bounds. IDs must be UUIDs. Text has length caps.
- `express.json` is capped at 100 kb. Restore uploads are capped at 50 MB, one
  file, `.sql` or `.json` only, and held in memory (never written to disk).
- Database access goes through Prisma (parameterised). The two raw queries use
  tagged-template `$queryRaw`, which sends values as bind parameters, so there
  is no SQL injection path.
- AI prompts treat user text strictly as data (prompt-injection guard), input
  length is capped, and model output is zod-validated before anything is saved.
- Quiz answer keys are withheld until the first attempt, and grading happens on
  the server, so a score cannot be forged from the browser. Quiz XP is awarded
  once per lesson (`quizPassedAt` is only set on the first pass).
- CSV exports prefix cells starting with `= + - @` to stop spreadsheet formula
  injection from user-entered titles.

## 7. Backup and restore (admin only)

- `pg_dump` and `psql` are run with `execFile` and an argument array, never a
  shell string, so nothing from `DATABASE_URL` or an upload is interpreted by a
  shell. The DB password is passed in `PGPASSWORD`, not on the command line,
  because argv is visible to other local users via `ps`. The child process gets
  a minimal environment, so `JWT_SECRET` and API keys are not inherited.
- Backups contain bcrypt hashes and all user data. They are sent with
  `Cache-Control: no-store` and must be stored as carefully as the database.
- Restore is destructive. The admin must type RESTORE and confirm a dialog, and
  the server also requires `confirm=RESTORE`. SQL restores run in a single
  transaction with `ON_ERROR_STOP`, and JSON restores in one Prisma
  transaction, so a bad file changes nothing.
- Residual risk, stated honestly: a `.sql` restore executes the uploaded SQL as
  the app's database role. The pg_dump banner check is a sanity check, not a
  sandbox. The real control is that only a SUPER_ADMIN can reach it. In
  production, the app should connect as a non-superuser role (in the Docker
  demo, `POSTGRES_USER=schediq` is a superuser), so a malicious dump could not
  use superuser features such as `COPY ... PROGRAM`.
- Every backup and restore is written to `BackupLog` with timestamp, format,
  size and the admin's email.

## 8. Account tiers

The FREE/PREMIUM tier is a demo flag, with no payment data anywhere. Limits
(5 AI parses per day, 2 courses) are enforced on the server with `402
UPGRADE_REQUIRED`, not just hidden in the UI. Known gap: the daily parse check
is count-then-insert, so two simultaneous requests at the boundary could both
pass. A real billing limit would use a row lock.

## 9. Known gaps / next steps

- No rate limiting on `/api/auth/login` yet (add `express-rate-limit` keyed by IP
  and email, plus lockout or backoff).
- No refresh tokens or server-side token revocation. Logout clears the client
  token only. A role change is enforced immediately for admin routes because the
  role is read from the DB, and a deleted account's token stops working (the user
  no longer exists). A **password reset does not yet invalidate JWTs already
  issued**; the fix is a `tokenVersion` (or `passwordChangedAt`) on User, checked
  by `requireAuth`.
- No rate limiting on `/api/auth/forgot` either (pair with the login limiter).
- CORS defaults to `*` when `CORS_ORIGIN` is unset. Always set it outside local
  development.
- No security headers middleware (helmet, CSP) on the API yet.
