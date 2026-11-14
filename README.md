# SchediQ

AI-assisted study scheduler. A student types tasks in plain English ("ERD
assignment, 6 hours, due next Friday"). SchediQ parses them into structured
tasks, then a deterministic engine places study sessions inside the student's
daily limit and preferred study window. It groups subjects that need the same
kind of thinking and widens the break whenever the cognitive category changes.

**Core rule:** AI is used only to parse text and to generate study courses.
Session placement is pure, rule-based code: the same input always gives the
same schedule.

Built for Richfield IT Project 700/600. Build brief: [docs/FRAME.md](docs/FRAME.md).

## Features

- **Accounts and security**
  - Register and log in with email, username and password, using JWT bearer tokens.
  - Passwords are hashed with bcrypt (12 rounds) and checked against strong rules shared by the client and the API.
  - Forgot password uses hashed, single-use reset links that expire after 30 minutes.
  - Users can change their password or delete their account.
  - Sessions are revoked server-side through `User.tokenVersion`: a password change, a used reset link or an admin temporary password signs the user out on every device.
  - Rate limits apply to login and registration and to the AI endpoints.
- **Tasks, subjects, preferences**
  - Task CRUD with a deadline, duration, priority and status (PENDING / SCHEDULED / IN_PROGRESS / DONE).
  - Each subject has a cognitive category (Analytical, Verbal, Technical, General) and a display colour.
  - Preferences set the daily minute limit, the study window, the break length and clustering on or off.
- **AI task parsing** (`AI_PARSER`)
  - `rule`: an offline regex parser.
  - `openai`: `gpt-4o-mini` with Structured Outputs. Any model failure falls back to the rule parser, so the request still succeeds.
  - Input is clipped to 500 characters, and every request is logged in `AiParseLog`.
- **Deterministic scheduler** (`backend/src/lib/scheduler.ts`)
  - Tasks are sorted by deadline, then priority, then id, so ties always break the same way.
  - Work is spread over the days before the deadline, with focus blocks of at most 90 minutes.
  - Same-subject work is clustered, and the break is widened ×1.5 when the cognitive category changes.
  - Each course paces at most one lesson per day.
  - The planning horizon is 60 days, guarded by an iteration cap.
  - Problems are reported with a reason (OVERDUE, AT_RISK, UNSCHEDULED). Nothing is dropped silently.
- **Courses and lessons**
  - Generates a course with lessons, key points and quizzes, from OpenAI or from offline templates.
  - Quizzes are graded on the server.
  - "Add this course to my schedule" turns each lesson into a task.
- **Progress**
  - XP, levels, streaks, badges and per-subject mastery.
  - All of these are derived from stored facts on every request, never kept as running totals.
- **Reports**: study schedule, workload, progress and admin, each with PDF (jsPDF), CSV and print.
- **Super admin**
  - User management (role, tier, temporary password, delete), system stats and a data-model view.
  - Backup and restore (`pg_dump` or JSON) in demo mode, plus optional off-site backup to S3-compatible storage with an optional cron schedule.
- **Installable PWA**: responsive down to phone width, with dark mode.
- **Tiers**: FREE and PREMIUM exist in the schema, but every limit is switched off for the demo (`TIER_LIMITS_ENABLED = false`). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript |
| Backend | Node.js, Express 5, TypeScript, Prisma 6, zod 4 |
| Database | PostgreSQL 16 |
| Auth | JWT (HS256), bcrypt |
| AI | OpenAI API (`gpt-4o-mini`), optional |
| Deployment | Vercel (frontend), Render (API), Neon (database). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## Repository layout

```
shared/validation.ts   validation rules imported by BOTH apps (dependency-free)
backend/               Express API
  prisma/              schema.prisma, migrations, seed.ts (super admin only)
  src/routes/          thin routers
  src/controllers/     request handling
  src/middleware/      auth, admin gate, rate limits, error handler
  src/lib/             scheduler, gamification, mastery, taskProgress, tier, env, jwt, backup, ...
  test/                node:test suites
frontend/              Next.js app (src/app routes, src/lib client + UI helpers)
docs/                  FRAME, ROADMAP, DEPLOYMENT, CLOUD_BACKUP, UAT, TEST_RESULTS
docker-compose.yml     local PostgreSQL 16
```

`shared/validation.ts` sits outside both apps, so each build is configured to reach it:

- **Backend:** `tsconfig.json` sets `rootDir: ".."`, so the build outputs `dist/backend/src/index.js` (the file `npm start` runs).
- **Frontend:** `next.config.ts` sets the Turbopack root to the repo root, and the `@shared/*` alias points to `../shared/*`.

## Prerequisites

- Node.js 20.9 or later
- Docker with Compose, for the local database
- Optional: an OpenAI API key, `pg_dump`/`psql` 16 for SQL-format backups

## Quick start

```bash
# 1. Database
docker compose up -d --wait

# 2. Backend (http://localhost:4000)
cd backend
cp .env.example .env            # set JWT_SECRET: openssl rand -base64 48
npm install
npx prisma migrate deploy
npx prisma generate
npx prisma db seed              # creates the super admin only
npm run dev

# 3. Frontend (http://localhost:3000), in a second terminal
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > .env.local
npm install
npm run dev
```

Health checks:

```bash
curl localhost:4000/api/health       # {"status":"ok"}
curl localhost:4000/api/health/db    # {"status":"ok","latencyMs":...}, 503 if the DB is down
```

If port 3000 is already in use, run the frontend with `npm run dev -- -p 3001`
and start the API with `CORS_ORIGIN=http://localhost:3001 APP_URL=http://localhost:3001 npm run dev`.

### Seed account

The seed creates one account and no demo data. Students register at `/register`.

| Email | Username | Password (local default) | Role / tier |
| --- | --- | --- | --- |
| `admin@schediq.app` | `admin` | `Study-Plan-2026!` | SUPER_ADMIN / PREMIUM |

Re-running the seed resets this account's password. With `NODE_ENV=production`
the seed refuses to run unless `SEED_ADMIN_PASSWORD` is set.

### Using OpenAI

Set `AI_PARSER=openai` and `OPENAI_API_KEY=sk-...` in `backend/.env`, then
restart the API. If the model fails, the request falls back to the offline
parser or the offline course templates.

## Tests

```bash
cd backend && npm test                 # 10 files, 116 tests (node:test)
cd backend && npx tsc --noEmit
cd frontend && npm run lint && npx tsc --noEmit
```

`test/integration.test.ts` runs the real controllers against the database in
`DATABASE_URL`. It creates throwaway users and deletes them afterwards, and it
skips itself when no database is reachable. The latest captured run is in
[docs/TEST_RESULTS.md](docs/TEST_RESULTS.md). The manual acceptance checklist
is [docs/UAT.md](docs/UAT.md).

## API

Base path `/api`. Every route needs `Authorization: Bearer <token>` except the
health checks and the public auth routes. Validation errors return
`400 {error, details: {fieldErrors}}`. Rate limits return `429 {code: "RATE_LIMITED"}`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness (public) |
| GET | `/health/db` | Database reachability (public) |
| POST | `/auth/register` | Create an account (public, rate limited) |
| GET | `/auth/username-available?username=` | Live username check (public, rate limited) |
| POST | `/auth/login` | Log in, returns a JWT (public, rate limited) |
| POST | `/auth/forgot` | Request a reset link (public, rate limited) |
| POST | `/auth/reset` | Set a new password with a reset token (public, rate limited) |
| GET | `/auth/me` | Current user |
| GET, POST | `/subjects` | List / create subjects |
| PUT, DELETE | `/subjects/:id` | Update / delete a subject |
| GET, POST | `/tasks` | List / create tasks |
| GET, PUT, DELETE | `/tasks/:id` | Read / update / delete a task |
| GET | `/sessions` | Planned and completed sessions plus schedule issues |
| POST | `/sessions/generate` | Regenerate the schedule (completed sessions are kept) |
| PATCH | `/sessions/:id` | Mark a session complete or incomplete |
| GET, PUT | `/preferences` | Read / update scheduling preferences |
| POST | `/ai/parse` | Parse free text into a task (per-user AI rate limit) |
| GET | `/progress` | XP, level, streak, badges, XP breakdown, leaderboard |
| GET | `/progress/overview` | Weekly summary, mastery, course progress, 14-day trend |
| GET, DELETE | `/account` | Account details / delete own account |
| PATCH | `/account/tier` | Change account tier |
| POST | `/account/password` | Change password (rate limited) |
| GET | `/courses` | List courses |
| POST | `/courses/generate` | Generate a course (per-user AI rate limit) |
| GET, PATCH, DELETE | `/courses/:id` | Read / link to a subject / delete a course |
| POST | `/courses/:id/schedule` | Create one task per pending lesson |
| PATCH | `/lessons/:id` | Complete a lesson or submit quiz answers |
| GET | `/admin/users?q=` | List and search users (super admin) |
| PATCH, DELETE | `/admin/users/:id` | Change role or tier / delete a user (super admin) |
| POST | `/admin/users/:id/reset-password` | Issue a temporary password (super admin) |
| GET | `/admin/stats` | System statistics (super admin) |
| GET | `/admin/data-model` | Entities and live row counts (super admin) |
| POST | `/admin/backup` | Download a backup (super admin, demo mode) |
| POST | `/admin/backup/cloud` | Upload a backup to S3-compatible storage (super admin) |
| POST | `/admin/restore` | Restore from an uploaded `.sql` or `.json` file (super admin, demo mode) |

## Configuration

The backend validates its environment at boot (`backend/src/lib/env.ts`). A
missing or invalid value stops the API with a list of every problem. Every
variable is documented in `backend/.env.example`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | | PostgreSQL URL the API uses (Neon: pooled) |
| `DIRECT_URL` | for migrations | | Non-pooled URL for `prisma migrate` (same DB locally) |
| `JWT_SECRET` | yes | | At least 32 characters |
| `CORS_ORIGIN` | yes | | Comma-separated frontend origins; `*` is rejected |
| `PORT` | yes | | API port (4000 locally; Render injects it) |
| `AI_PARSER` | yes | | `rule` (offline) or `openai` |
| `OPENAI_API_KEY` | when `AI_PARSER=openai` | | OpenAI key |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime |
| `DEMO_MODE` | no | `false` | Shows reset links in the UI and enables in-app backup. Never in production |
| `AI_RATE_LIMIT_PER_HOUR` | no | `200` | Per-user AI requests per hour (1 to 10000) |
| `APP_URL` | no | first `CORS_ORIGIN` | Frontend origin for reset links |
| `BACKUP_MODE` | no | `auto` | `auto` (pg_dump, JSON fallback) or `json` |
| `PG_DUMP_PATH`, `PSQL_PATH` | no | | Override the binary paths |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | no | | Off-site backup. Enabled only when all five are set. See [docs/CLOUD_BACKUP.md](docs/CLOUD_BACKUP.md) |
| `BACKUP_SCHEDULE` | no | | `daily` (03:00) or a cron expression; needs `S3_*` |
| `SEED_ADMIN_PASSWORD` | in production | `Study-Plan-2026!` locally | Super admin password used by the seed |

Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). It is
inlined at build time, so the frontend must be rebuilt after changing it.

## Documentation

- [SETUP.md](SETUP.md): full setup and feature walkthrough
- [SECURITY.md](SECURITY.md): security model and known gaps
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Vercel + Render + Neon
- [docs/CLOUD_BACKUP.md](docs/CLOUD_BACKUP.md): S3-compatible backup setup
- [docs/UAT.md](docs/UAT.md): user acceptance checklist
- [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md): latest automated test run
- [docs/ROADMAP.md](docs/ROADMAP.md): planned Premium tier
