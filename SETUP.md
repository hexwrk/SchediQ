# SchediQ: Setup

Run everything from scratch. Node 20+ is required (Next 16 toolchain).

## 1. Database (Docker)

From the repo root:

```bash
docker compose up -d --wait
```

Brings up `postgres:16` on `localhost:5432` (db/user/password all `schediq`),
with a healthcheck and a named volume for persistence.

## 2. Backend

```bash
cd backend
cp .env.example .env            # then set JWT_SECRET (openssl rand -base64 48)
npm install
npx prisma migrate deploy       # applies every migration in order (see list below)
npx prisma generate
npx prisma db seed              # creates the super admin only (no demo data)
npm run dev                     # API on http://localhost:4000
```

Migrations, in order: `init`, `scheduling_prefs`, `session_completion`,
`roles_tiers` (role + account tier, AI parse log, backup log),
`require_user_name` (backfills null names from the email local part, then sets
NOT NULL), `courses_lessons` (Course, Lesson, Course.subjectId, Task.lessonId),
`password_reset` (hashed, single-use reset tokens), `task_in_progress` and
`backfill_in_progress` (IN_PROGRESS status), `must_change_password` (flag set
by an admin-issued temporary password), `token_version` (session revocation),
`user_username` (adds `User.username`, backfills every existing account from
its email local part, deduplicated, THEN sets NOT NULL + UNIQUE),
`backup_destination` (`BackupLog.destination` local/drive plus the Drive file
id and link).

Tests (Node's built-in runner, no extra framework):

```bash
cd backend && npm test          # scheduler, mastery, validators (password, username), rule parser, task progress, env + Drive config
```

Health checks: `curl localhost:4000/api/health` returns `{"status":"ok"}`;
`curl localhost:4000/api/health/db` returns `{"status":"ok","latencyMs":...}`
(503 `{"status":"fail"}` if the database is unreachable).

The backend `.env` (every variable is documented in `backend/.env.example` and
validated at boot by `src/lib/env.ts`; a missing or invalid one stops the API
with a list of what to fix):

```
DATABASE_URL="postgresql://schediq:schediq@localhost:5432/schediq"
DIRECT_URL="postgresql://schediq:schediq@localhost:5432/schediq"
JWT_SECRET="<openssl rand -base64 48, at least 32 characters>"
JWT_EXPIRES_IN="7d"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
AI_PARSER=rule
OPENAI_API_KEY=""
DEMO_MODE=true
APP_URL="http://localhost:3000"
BACKUP_MODE=auto
```

`DIRECT_URL` is read by every Prisma migrate command (on Neon it is the
non-pooled URL); locally it is the same database. `DEMO_MODE=true` is local
only: it shows password reset links in the UI and enables in-app backups. It
replaces the old `RESET_DEMO_MODE`.

`npm run build` compiles to `dist/backend/src/index.js` (the backend's
`rootDir` is the repo root so it can compile `shared/validation.ts`); `npm start`
runs that file.

## 3. Frontend

```bash
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > .env.local
npm install
npm run dev                     # app on http://localhost:3000
```

`next.config.ts` sets `turbopack.root` to the repo root so the frontend can
import `shared/validation.ts` (the same validator file the backend uses). A
`prebuild` preflight (`scripts/check-build-env.mjs`) stops the build early if
`../shared` is missing or, on Vercel, if `NEXT_PUBLIC_API_URL` is unset.

## 4. Accounts and the walkthrough

The seed creates exactly one account; there are no demo users or demo data.

| Account | Password | Role / tier |
| --- | --- | --- |
| `admin@schediq.app` (username `admin`) | `Study-Plan-2026!` | SUPER_ADMIN, PREMIUM (admin users, System & backup, Data model, Admin report) |

`Study-Plan-2026!` is the local default only (it meets the stronger password
rules; the old `admin1234` does not). Re-running the seed resets the admin's
password to it and assigns the reserved username `admin` (the backfill gives
the existing admin `admin1`, because `admin` is reserved). Existing accounts
keep logging in with their current passwords: the rules apply when a password
is set, not at login. With `NODE_ENV=production` the seed
refuses to run unless `SEED_ADMIN_PASSWORD` is set, and the password can be
changed any time on **Account > Change password**. Students register themselves
at `/register` and start on the FREE tier.

### The connected use case (walkthrough with a fresh account)

Plan your work, learn weak topics through a generated course, and watch mastery
and progress grow:

1. **Register** a new account. The Dashboard shows a 3-step onboarding checklist
   instead of empty widgets.
2. **Subjects**: add two or three (e.g. Databases, Networking).
3. **Add task**: type a sentence such as "ERD assignment, 6 hours, due next
   Friday", Parse, Save. Then **Generate schedule** on the Dashboard: the six
   hours are spread over the days up to the deadline, not packed into the first few.
4. **Courses**: generate a course for a weak subject and link it to that
   subject. Open lesson 1, answer the quiz, Submit: `+50 XP` (20 lesson + 30
   quiz). Back on the Dashboard the subject's mastery bar, the course bar, the
   weekly summary and the HUD all move, and stay after a reload.
5. On the course page, **Add this course to my schedule** creates one task per
   lesson. Regenerate: lessons are paced one per day per course. Completing a
   lesson's study block completes the lesson, and vice versa.
6. **Tier gate**: as a FREE account, generate a third course to see the
   "Upgrade to Premium" prompt; **Upgrade** (demo, no payment) lifts it.

## 5. Validation (client AND server, one shared rule file)

`shared/validation.ts` holds every rule. The frontend imports it for inline
errors under each input; the backend wraps the same functions in zod
(`backend/src/lib/validators.ts`). They cannot drift apart.

- **Email**: `local@domain.tld`, where the label before the TLD is at least 2
  characters and the TLD is at least 2 letters. Rejects `yd@g.com` and
  `a@b.c`, accepts `tristan@gmail.com`. Stored lower-cased.
- **Password** (`passwordChecks` in `shared/validation.ts`): 12-72 characters
  with an uppercase letter, a lowercase letter, a number and a symbol; must not
  contain the username or the email name (the part before `@`, ignoring
  `+tag`, 3+ chars); must not be a common password. The blocklist
  (`COMMON_PASSWORDS`) is matched after stripping leading/trailing digits and
  symbols and undoing l33t swaps, so `Password123!` and `P@ssw0rd!` are caught.
  72 is bcrypt's input limit. Register, Reset password and Change password show
  a live checklist (one line per rule, ticked as you type) and a strength
  meter; the submit button stays disabled until every rule passes. The server
  returns one message per failing rule in `details.fieldErrors.password`.
  On Reset, the page only has the token, so the "not your username/email" rule
  is shown as "checked when you submit" and enforced by the server.
- **Username**: 3-20 characters, lowercase letters, digits and `_`, must start
  with a letter, no spaces; trimmed and lower-cased on input (`  Tristan_J ` is
  stored as `tristan_j`); reserved names (`admin`, `root`, `system`, `api`,
  `support`... see `RESERVED_USERNAMES`) are refused. Unique. Login stays by
  email.
- **Name**: required (whitespace-only is blank), up to 80 characters.
- **Numbers**: duration 5-600 min, daily limit 30-720 min, break 0-120 min,
  lessons per course 2-6. Blank, non-numeric, negative and decimal input each
  get a specific message.
- **Other**: task title 1-200, deadline year 2000-2100, preferred end after
  start, subject name 1-60 (duplicates caught), course topic 2-80 with at least
  one letter, course level from a fixed list.

The server returns `400 { error, details.fieldErrors }`, and the forms map
those back under the matching input.

## 6. Seeing the data in Postgres (Prisma Studio)

Every form writes straight to PostgreSQL. To see a record you just created:

```bash
cd backend
npx prisma studio               # opens http://localhost:5555
```

Open the `User`, `Task`, `Course` or `Lesson` table and find the row. Or with psql:

```bash
psql postgresql://schediq:schediq@localhost:5432/schediq \
  -c 'select email, name, role, "accountType" from "User" order by "createdAt" desc limit 5;'
```

## 7. Course generator

`POST /api/courses/generate { topic, level, lessonCount, subjectId? }`

- **Offline (default, `source = SEED`)**: picks a template by topic keywords
  (networking, databases/SQL, Python, cybersecurity, operating systems). Any
  other topic gets an honest "structured study plan" course built on
  evidence-based study techniques. Works with no network.
- **OpenAI (`AI_PARSER=openai` + `OPENAI_API_KEY`, `source = AI`)**: Structured
  Outputs, temperature 0.4, `gpt-4o-mini`. The response is validated with zod
  (3-5 key points, exactly 3 questions, answer index in range). On any failure
  it falls back to the templates.
- Every lesson has an explanation, key points and a 3-question multiple-choice
  quiz. The answer key is withheld from the API until the first submission, and
  grading happens on the server (`PATCH /api/lessons/:id { quizAnswers }`).
- **Tier gate**: FREE accounts can generate 2 courses, PREMIUM is unlimited.
  At the cap the API returns `402 { code: "UPGRADE_REQUIRED" }` and the UI
  shows an Upgrade prompt.

Other endpoints: `GET /api/courses`, `GET /api/courses/:id`,
`PATCH /api/courses/:id { subjectId }`, `DELETE /api/courses/:id`,
`POST /api/courses/:id/schedule`.

## 8. XP, levels, badges, mastery

XP is **derived**, never stored. `backend/src/lib/gamification.ts` turns the
persisted facts (completed sessions, completed lessons, first quiz pass,
finished courses) into a list of XP events and sums them. Recomputing from the
same rows always gives the same total, so XP cannot drift and always survives a
reload. The HUD refetches on every navigation and after every action.

| Source | XP |
| --- | --- |
| Complete a study session | `round(minutes / 3)` |
| Focus bonus (previous completed session that day was the same cognitive category) | +25% on that session |
| Complete a lesson | +20 |
| Pass a lesson quiz (best score >= 70%, once per lesson) | +30 |
| Each calendar day with any activity | +10 |
| Finish every lesson in a course | +100 |

- Levels: reaching level L needs `100 * (L-1) * L / 2` XP (L2 = 100, L3 = 300,
  L4 = 600...). Titles: Novice, Apprentice, Learner, Scholar, Specialist,
  Expert, Master, Grandmaster.
- Streak: consecutive active days ending today (or yesterday if nothing yet today).
- Badges: First Focus, Century, Rising Star, Clean Sweep, Deep Focus, Week
  Warrior, First Course, Quiz Ace (100% on a quiz), Course Complete, Scholar
  (10 lessons).
- The Progress page lists every source in a "How to earn XP" panel with what
  you have earned from each.

**Subject mastery (0-100)**, in `backend/src/lib/mastery.ts`:

```
lessons = completed lessons / total lessons          (courses linked to the subject)
quizzes = sum of best quiz scores / (lessons * 100)  (an untaken quiz counts 0)
study   = completed session minutes / planned task minutes for the subject (max 1)
mastery = round(100 * (40*lessons + 30*quizzes + 30*study) / sum of weights that apply)
```

A component only applies when it has a denominator. A subject with no course is
scored on study alone. "Change this week" re-runs the formula as of Monday
00:00 using only facts timestamped before then.

`GET /api/progress` returns XP, level, streak, badges, the per-source
breakdown, the rules, recent XP events and the leaderboard.
`GET /api/progress/overview` returns the dashboard's weekly summary, mastery,
course progress and 14-day trend.

## 9. Account tiers (demo, no billing)

FREE: 5 AI task parses per day and 2 generated courses. PREMIUM: unlimited.
The tier badge in the top bar links to **Upgrade**, which flips the tier via
`PATCH /api/account/tier`. The page states plainly that this is a demo tier and
nothing is charged.

## 10. Super admin

Log in as `admin@schediq.app`. A "Super admin" section appears in the sidebar
(hidden for everyone else). All its API routes sit behind `requireAuth` and
`requireSuperAdmin`, so a normal user gets `403`. In the UI, a normal user who
opens `/admin` sees an "Access denied" page.

- **Users**: every account with role, tier, username and counts. Change role
  or tier. The search box (name, email or username, debounced) queries the
  server (`GET /api/admin/users?q=`), so it scales as the user list grows.
  Delete requires typing the account's email. Admins cannot demote or delete
  themselves. **Reset password** issues a one-time temporary password, shown
  to the admin once; the user is asked to change it after logging in (account
  recovery without email).
- **System & backup**: live counts and database size, plus:
  - **Create backup**: `POST /api/admin/backup` runs `pg_dump` (execFile with
    an argument array, password in `PGPASSWORD`) and downloads a timestamped
    `.sql`. If pg_dump is missing or fails, it downloads a full `.json` export
    instead. The last backup time is shown.
  - **Restore (destructive)**: upload a `.sql` or `.json` backup, type
    RESTORE, and confirm. `.sql` is replayed with `psql --single-transaction
    -v ON_ERROR_STOP=1`; `.json` is imported in one Prisma transaction. A bad
    file changes nothing.
  - The host's `pg_dump`/`psql` major version must match the server
    (postgres:16). Otherwise backup falls back to JSON; restore JSON instead.
  - Backup and restore are a local/demo feature: with `DEMO_MODE=false`
    (production, Neon) the page says "Production backups are managed by Neon"
    and the buttons are disabled.
- **Data model**: the seven entities, their relationships in plain language, a
  diagram, and live row counts. Built for presentations.

## 11. Reports

**Reports** in the sidebar. Study schedule, Workload summary and Progress
report each have **Download PDF**, which builds a real `.pdf` file in the
browser (jsPDF + jspdf-autotable, loaded on click) and downloads it: title,
generated date and time, your name, username and email, the period, the summary
totals, vector bar chart(s) and the report table(s), with page numbers. No print
dialog and no server work, so it behaves the same on Vercel. **Print** (app
chrome hidden) and **Download CSV** of the same data are still there. The
on-screen totals, CSV and PDF are built from the same arrays, so they agree.
Non-Latin-1 characters in titles (emoji, CJK) print as `?` in the PDF because
the built-in Helvetica font cannot draw them.

1. Study schedule: upcoming sessions (day, time, task, subject).
2. Workload summary: tasks by subject and by priority, with hours and counts.
3. Progress report: completion rate, XP by source, streak, level, per-subject
   completion and mastery, badges.
4. Admin system report (super admin only): users by role and tier, plus totals.

CSV cells that start with `= + - @` are prefixed with `'` to block
spreadsheet formula injection from user-entered task titles.

## 12. Switching the AI to OpenAI

Both the task parser and the course generator run offline by default. To use OpenAI:

1. In `backend/.env` set:
   ```
   AI_PARSER=openai
   OPENAI_API_KEY=sk-...
   ```
2. Restart `npm run dev` in `backend`.

The model is `gpt-4o-mini` (the `MODEL` constant in `ai.controller.ts` and
`courses.controller.ts`). Both prompts treat user text strictly as data (a
prompt-injection guard). On any failure, both fall back to the offline path.

`lib/openai.ts` builds every client with a 20 s timeout and one retry (the SDK
retries only connection errors, 408/409/429 and 5xx), and each call caps its
output tokens. Failures are logged as one line with the error class, status
and code; the key and the prompt are never logged. AI endpoints are rate
limited to 20 requests per hour per user (`429`).

## 13. Scheduler robustness

The scheduler (`backend/src/lib/scheduler.ts`) is pure and deterministic, and
covered by `backend/test/scheduler.test.ts`:

| Situation | Behaviour |
| --- | --- |
| Deadline already passed | Placed as soon as possible from now (never in the past), flagged **Overdue** |
| Task longer than the daily limit | Spread across the days before its deadline (never more than the daily limit on any day) |
| Cannot finish before its deadline | Kept and placed in full, flagged **At risk** with the date its last block ends |
| Does not fit at all (zero window/limit, or past the horizon) | Not dropped: flagged **Not scheduled** with the reason and the setting to change |
| No tasks | Empty schedule, the dashboard explains what to do next |
| No saved preferences | Defaults (180 min/day, 09:00-21:00, 10 min breaks, clustering on) |
| Very many tasks | Planning horizon of 60 days bounds the work; 2,000 tasks schedule in well under 2 s |

**How work is distributed (spread, not front-loaded).** Two passes:

1. *Allocate* (tasks in deadline, priority, id order). Each task's minutes are
   spread over the days from today to its deadline. It uses at most
   `floor(minutes / MIN_DAILY_SHARE_MIN)` days (45 min minimum share), picked
   evenly across that range. Each day re-targets
   `ceil(remaining / days left)`, so a day that is already full passes its
   shortfall to the next. A 6-hour task due in 7 days becomes about 45 min a day
   for 8 days, not three packed days. Leftovers go to any other free day before
   the deadline, then as early as possible after it (flagged At risk).
   Lesson tasks from a course are paced instead: at most `MAX_LESSONS_PER_DAY`
   (1) per course per day.
2. *Lay out* each day: tasks in allocation order, with subject clustering
   (same-subject work back to back). Each task gets **one** block per day,
   split into equal blocks of at most `MAX_FOCUS_MIN` (90) only when longer.
   There is a normal break between blocks and a `SWITCH_PENALTY` (1.5x) break
   when the cognitive category changes. Break time is reserved during
   allocation, so a day can never run past the study window.

The same input always gives byte-identical output (`npm test` checks this).

`GET /api/sessions` and `POST /api/sessions/generate` return `{ sessions,
issues }`. The issues are re-derived from the stored rows on every load, so the
dashboard's **Needs attention** panel stays accurate as time passes (add a task
with yesterday's deadline to see it).

## 14. One progress system (lessons <-> tasks)

"Add this course to my schedule" creates one task per lesson (`Task.lessonId`).
The link works in both directions:

- Finishing every study block of a lesson's task, or ticking it done in the
  Task list, completes the lesson (lesson XP, course progress, mastery).
- Completing the lesson (button or passing its quiz) marks its task DONE.

Deleting a course deletes its lessons. Its tasks are kept and just unlinked.

## 15. Accounts: password reset and deletion

- **Forgot password** (link on the login page): `POST /api/auth/forgot` creates a
  30-minute, single-use token (stored as a SHA-256 hash), then
  `/reset-password?token=...` sets a new password via `POST /api/auth/reset`.
  There is no email service yet. With `DEMO_MODE=true` (local) the link is
  shown on screen. With `DEMO_MODE=false` (production) the response is only the
  generic message and the link is written to the API log (`[reset] ...`); users
  recover through an admin-issued temporary password instead.
- **Change password** (Account page): `POST /api/account/password` with the
  current and new password. Also clears an admin-issued temporary password.
- **Signing out other devices:** changing the password, using a reset link or
  an admin temporary password increments `User.tokenVersion`, which every JWT
  carries. Older tokens get 401 on their next request and that browser lands on
  the login page with a "session has ended" notice. The device that changed the
  password receives a fresh token and stays signed in.
- **Delete account** (Account page): requires the current password and typing
  DELETE. Cascades to everything the user owns. The only remaining super admin
  cannot delete themselves.

## 16. Phone, tablet and installable app (PWA)

- Below 1024 px the sidebar becomes a drawer behind a menu button. Tables,
  report tables and the weekly calendar scroll sideways instead of overflowing.
- `src/app/manifest.ts` (served at `/manifest.webmanifest`) plus icons in
  `public/` make SchediQ installable. In Chrome or Edge use the install icon in
  the address bar (desktop) or "Add to Home screen" (Android). On iOS Safari, use
  Share then "Add to Home Screen". There is no service worker, so it is
  installable but not usable offline (the data lives on the API anyway).

## 17. Empty, loading and error states

Every data page loads through one hook (`src/lib/use-api.ts`) and renders one
of: a loading skeleton, a friendly error with **Try again**, an empty state that
explains the page and links to the next action, or the data. A new account
sees a 3-step onboarding checklist on the dashboard. Unexpected render errors
are caught by `src/app/(app)/error.tsx` (and `global-error.tsx` for the root),
and unknown URLs get a friendly 404.

## 18. Per-task progress

Every task response (`GET /api/tasks`, `GET /api/tasks/:id`, and create/update)
carries a `progress` object derived from the task's study sessions in
`backend/src/lib/taskProgress.ts`:

```
progress: { totalMin, completedMin, percent, sessionsTotal, sessionsDone, nextSessionAt }
```

`totalMin` is the sum of the task's session lengths (its `durationMin` when it
has none yet). `percent` is `round(completedMin / totalMin * 100)`, and 0 with no
sessions. `nextSessionAt` is the earliest session not yet done. Nothing is
stored, so a reload always shows what the database holds.

- **Status follows progress** when a session is toggled: no sessions gives
  `PENDING`, none done gives `SCHEDULED`, some done gives `IN_PROGRESS` (new
  enum value, migrations `task_in_progress` and `backfill_in_progress`), and all
  done gives `DONE`. Ticking a task done by hand still marks it `DONE`.
  Un-ticking re-derives the status from its sessions.
- **Regenerating keeps progress:** only the task's *remaining* minutes are
  re-planned. Completed sessions stay, and new blocks never overlap them (they
  count toward that day's limit).
- **UI:** the Task list shows a thin bar in the subject's colour with "1 of 3
  sessions done · 50 / 150 min (33%) · next Thu 09:00". Finished tasks show a
  full grey bar. The Dashboard's **In progress** panel lists every task between
  0% and 100%. Ticking a calendar block refetches the dashboard data, so the
  matching bar moves straight away. Subject-coloured fills are adjusted per
  theme so every bar keeps at least 4.5:1 against its track in light and dark.

## 19. Dark mode

The theme toggle (sun / moon / monitor icon in the top bar) cycles **Light,
Dark, System**. System is the default and follows the OS setting live. The
choice is saved in `localStorage` (`schediq_theme`).

- `src/lib/theme.ts` holds a tiny inline script, rendered in `<head>` by the
  root layout. It sets `<html data-theme="light|dark">` while the HTML is still
  parsing, before first paint, so a saved dark choice never flashes light. This
  is the approach from the Next docs guide "Preventing flash before hydration".
  `<html>` carries `suppressHydrationWarning` so React keeps that attribute.
- Every colour is a token in `globals.css` with a light and a dark value
  (including Tailwind's red scale for errors and destructive actions, and
  `color-scheme` so native date pickers and selects match). Every text token
  passes 4.5:1 contrast on its backgrounds in both themes, and form-field
  borders use a separate `--input` token at 3:1 or more.
- Printing always uses the light palette, so reports print dark-on-white
  whatever theme is on screen.

See `docs/UAT.md` for the user acceptance test checklist.

## 20. Production configuration

Deploying to Vercel + Render + Neon is covered step by step in
`docs/DEPLOYMENT.md` (exact platform settings, env vars, post-deploy checks).
What the code does for production:

- Env validation at boot (`backend/src/lib/env.ts`), fail fast with a list.
- `helmet` security headers, no `X-Powered-By`, `trust proxy` = 1 for Render.
- CORS allowlist from `CORS_ORIGIN` (comma-separated, `*` refused).
- Rate limits: 10 requests / 15 min / IP on login, register, forgot, reset and
  change password; 20 / hour / user on `/api/ai/*` and course generation.
- One access log line per request (`morgan`, no bodies); generic error
  responses with full server-side logs.
- `prisma migrate deploy` for production schema changes (never `migrate dev`).
- Seed in production requires `SEED_ADMIN_PASSWORD`.

## 21. Usernames

`User.username` is required and unique. Register has a Username field with live
format messages (every failing rule listed) and a debounced availability check
(`GET /api/auth/username-available?username=`, rate limited to 60 / 15 min /
IP), which answers "available", "taken" or the format problems. A sign-up race
for the same name is settled by the unique index and returns the same
`409` field error. The username shows on the Account page, in the top bar and
in the admin Users list.

Migration `20261101090000_user_username` backfills existing rows in signup
order: email local part, lower-cased, `+tag` dropped, other characters turned
into `_`, prefixed with `u` if it does not start with a letter, padded to 3,
cut to 20; a reserved or taken name gets a numeric suffix (`john`, `john1`,
`john11` if `john1` already belonged to someone). Only after every row has a
valid unique name does it add NOT NULL and the unique index, so it cannot fail
on existing data. A test keeps the migration's reserved list identical to the
shared one.

## 22. Search on lists

Tasks, Subjects, Courses and admin Users each have a search box (250 ms
debounce) that narrows the list by title/name (plus subject, topic, email or
username where relevant) with an "N of M shown" count and a Clear search empty
state. Your own tasks, subjects and courses are filtered in the browser (they
are already loaded and small); admin Users is searched on the server. The
existing Delete on each row works on the filtered results and still asks for
confirmation (Tasks/Subjects/Courses: a confirm dialog; Users: type the
account's email).

## 23. Off-site backup to cloud storage (S3-compatible)

**System & backup > Back up to cloud (off-site)** uploads a gzipped full-system
dump to an S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3, MinIO)
under `backups/` and shows a presigned download link valid for about an hour.
Provider setup is in `docs/CLOUD_BACKUP.md`. Env vars, all optional:

```
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
BACKUP_SCHEDULE=               # optional: daily, or a cron expression
```

Cloud backup is on only when all five `S3_*` are set (`storageConfigured()` in
`env.ts`); otherwise the page shows "Configure cloud backup" and
`POST /api/admin/backup/cloud` returns `409 STORAGE_NOT_CONFIGURED`. Each upload
is logged in `BackupLog` (`destination = s3`, object key). A downloaded
`.sql.gz` / `.json.gz` can be uploaded on the Restore form as is.

## Production build check

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npm run lint && npm run build    # build is the real test of Next 16 correctness
```

See `SECURITY.md` for the security model.
