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
- The password rule is 12-72 characters with an uppercase letter, a lowercase
  letter, a number and a symbol; it must not contain the username or the email
  name, and must not be on the shipped common-password blocklist (matched after
  stripping bolted-on digits/symbols and l33t swaps). Each failing rule gets its
  own message from the same shared function on the client and the server.
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
- **Rate limiting** (`express-rate-limit`,
  `backend/src/middleware/rateLimit.middleware.ts`): login, register, forgot,
  reset and change password each allow 10 requests per 15 minutes per IP, then
  `429` with a clear message and standard `RateLimit` headers. `trust proxy` is
  set to exactly one hop (Render's proxy), so the client IP comes from
  `X-Forwarded-For` without letting a client spoof it.

## 2b. Password recovery, change and account deletion

- `POST /api/auth/forgot` always answers with the same generic message, whether
  or not the email is registered, so it cannot be used to enumerate accounts.
- The reset token is 32 random bytes (256 bits, `crypto.randomBytes`), sent only
  in the link. The database stores its **SHA-256 hash**, so a leaked
  `PasswordResetToken` row cannot be turned into a working link. A fast hash is
  fine here (unlike passwords) because a 256-bit random value cannot be brute-forced.
- Tokens expire after **30 minutes** and are **single use**. Requesting a new link,
  or using one, burns every other outstanding link for that account.
- The new password goes through the same shared validator and bcrypt (12 rounds).
- **No email service yet.** With `DEMO_MODE=true` (local only) the API returns
  the reset link in the response so the flow can be tested. In production
  (`DEMO_MODE=false`, the default) the response is ONLY the generic message:
  returning the link would hand it to whoever typed the email, i.e. account
  takeover. The link is written to the server log (`[reset] ...`), so log
  access is sensitive until a real mailer replaces it.
- **Admin recovery without email:** `POST /api/admin/users/:id/reset-password`
  (super admin only, not for the admin's own account) sets a random temporary
  password (16 chars from a 55-symbol mixed-case alphabet via `crypto.randomInt`, ~92
  bits), burns outstanding reset links, signs the user out everywhere
  (`tokenVersion`), sets `mustChangePassword`, and returns
  the password once with `Cache-Control: no-store`. It is never logged; the log
  records only who reset whom. The user sees a banner until they change it.
- **Change password:** `POST /api/account/password` re-checks the current
  password, refuses reusing it, clears `mustChangePassword`, burns outstanding
  reset links and revokes all other sessions, returning a fresh token for the
  current one.
- `DELETE /api/account` requires the **current password** (a stolen token alone
  cannot destroy an account) plus `confirm: "DELETE"`. It cascades to all owned
  rows. The last remaining SUPER_ADMIN cannot delete themselves.

## 3. Sessions: JWT bearer tokens

- On login or register the API signs a JWT containing only `{ userId }`, with
  `JWT_SECRET` from the environment (the server refuses to start unless it is
  at least 32 characters, see `backend/src/lib/env.ts`) and an expiry of
  `JWT_EXPIRES_IN` (default 7 days). Verification pins `HS256`, so a token's
  header cannot pick the algorithm. See `backend/src/lib/jwt.ts`.
- Every data route uses `requireAuth`
  (`backend/src/middleware/auth.middleware.ts`), which verifies the signature and
  expiry and sets `req.userId`. Missing or invalid tokens get `401`.
- **Revocation (`User.tokenVersion`).** Each token carries the user's
  `tokenVersion` as the `tv` claim, and `requireAuth` looks the user up on
  every request (one primary-key read) and rejects the token if the account is
  gone or the version no longer matches. The version is incremented when the
  password changes (Account page), when a reset link is used, and when an admin
  issues a temporary password, so every older token on every device stops
  working on its next request. The device that changed its own password gets a
  fresh token and stays signed in. Tokens issued before this existed have no
  `tv` and are read as version 0 (the column default), so deploying it logs
  nobody out. The frontend treats any 401 on an authenticated request as
  "session ended": it clears the stored token and shows a notice on the login
  page.
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
- In production (`DEMO_MODE=false`, or a production host without `pg_dump`)
  both endpoints return `409 BACKUP_DISABLED` and the UI explains that Neon
  manages backups, so no database dump can be pulled through the web app.
- **Off-site cloud backup** (`POST /api/admin/backup/cloud`, super admin
  only) works in production too, but the dump goes straight from the API to
  the configured S3-compatible bucket, never through the API response. The
  browser gets only a presigned GET link valid for one hour (sent with
  `Cache-Control: no-store`, never stored or logged). The access key pair is
  env-only, never logged or returned (the UI only gets a configured flag), and
  storage error logs redact SigV4 signatures, access key IDs and the secret.
  Scope the key to the one backup bucket. Restore accepts `.gz` with a 256 MB
  unpacked cap against decompression bombs.

## 8. Account tiers

The FREE/PREMIUM tier is a demo flag, with no payment data anywhere. During
the demo the FREE caps are switched off (`TIER_LIMITS_ENABLED = false`), so
no account is gated and the per-user AI rate limit (`AI_RATE_LIMIT_PER_HOUR`,
default 200/hour) is the only bound on AI calls. With the switch on, limits
(5 AI parses per day, 2 courses) are enforced on the server with `402
UPGRADE_REQUIRED`, not just hidden in the UI. Known gap: the daily parse check
is count-then-insert, so two simultaneous requests at the boundary could both
pass. A real billing limit would use a row lock.

## 9. Transport, headers, configuration and logging

- `helmet` on every response: HSTS, `X-Content-Type-Options: nosniff`, a strict
  CSP, `frame-ancestors`, and no `X-Powered-By` (also disabled explicitly).
- CORS is an allowlist from `CORS_ORIGIN` (comma-separated exact origins). `*`
  and malformed origins are rejected at boot. Other origins get no CORS headers.
- All configuration is validated at boot with zod. A missing or weak value
  stops the server and lists every problem, without echoing values.
- Error responses are generic (`Internal server error`, `Malformed request
  body.`); full errors go to the server log only. Access logs (`morgan`) record
  method, path, status, size and latency, never bodies or headers.
- OpenAI calls: 20 s timeout, one retry on transient errors, capped output
  tokens, 20 requests / hour / user. Failures log the error class, status and
  code with anything key-shaped redacted; never the key or the user's prompt.
  Every failure falls back to the offline parser/templates.

## 10. Known gaps / next steps

- Rate limit counters are in memory (per process). Correct for one instance;
  multiple instances need a shared store such as Redis.
- No refresh tokens, and logout only clears the token in that browser (it is
  not revoked server-side, so a copied token stays valid until it expires or
  the password changes). A "sign out everywhere" button would just increment
  `tokenVersion`.
- Password reset links are logged server-side in production until a mailer
  (e.g. Resend) is added.
