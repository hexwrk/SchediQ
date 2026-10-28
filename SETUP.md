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
cp .env.example .env            # then set a real JWT_SECRET
npm install
npx prisma migrate deploy       # applies every migration in order (see list below)
npx prisma generate
npx prisma db seed              # admin + demo users + classmates + courses + schedule + history
npm run dev                     # API on http://localhost:4000
```

Migrations, in order: `init`, `scheduling_prefs`, `session_completion`,
`roles_tiers` (role + account tier, AI parse log, backup log),
`require_user_name` (backfills null names from the email local part, then sets
NOT NULL), `courses_lessons` (Course, Lesson, Course.subjectId, Task.lessonId).

Health check: `curl localhost:4000/api/health` returns `{"status":"ok"}`.

The backend `.env` needs:

```
DATABASE_URL="postgresql://schediq:schediq@localhost:5432/schediq"
JWT_SECRET="<a long random string>"
JWT_EXPIRES_IN="7d"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
AI_PARSER=rule
OPENAI_API_KEY=""
BACKUP_MODE=auto
```

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
import `shared/validation.ts` (the same validator file the backend uses).

## 4. Demo logins

| Account | Password | Role / tier | Use it to show |
| --- | --- | --- | --- |
| `demo@schediq.app` | `demo1234` | USER, PREMIUM | The full journey: populated dashboard, courses, mastery, XP |
| `free@schediq.app` | `free1234` | USER, FREE | Tier gate: already at the 2-course cap, so Generate shows the Upgrade prompt |
| `admin@schediq.app` | `admin1234` | SUPER_ADMIN, PREMIUM | Admin users, System & backup, Data model, Admin report |

These are demo credentials. Change or delete them on anything that is not a
local demo.

### The connected use case (demo script)

Plan your work, learn weak topics through a generated course, and watch
mastery and progress grow. Log in as `demo@schediq.app`:

1. **Dashboard** is the progress home: this week's hours, lessons, quizzes,
   streak and level; per-subject mastery bars with their weekly change; active
   course cards; a 14-day XP / study-minutes trend; then the weekly calendar.
   On first login: Databases course 2/5 (40%), Networking course complete,
   Operating Systems at 0% mastery.
2. **Add task**: type a sentence, Parse, Save. Then **Regenerate schedule** on
   the Dashboard and the task appears on the calendar.
3. **Courses**: open "Operating Systems Core Concepts" (or generate a new
   course and link it to a subject). Open lesson 1, answer the quiz
   (lesson 1 answers: 2nd, 1st, 3rd option), Submit.
4. A `+50 XP` float appears (20 lesson + 30 quiz). Back on the Dashboard,
   Operating Systems mastery moves from 0% to 14%, the course bar reads 1/5,
   and "Lessons this week" / "Quizzes passed" go up. Reload: it all persists.
5. On the course page, **Add this course to my schedule** creates one 30-minute
   task per unfinished lesson (linked by `Task.lessonId`). Regenerate the
   schedule and they appear on the calendar. Completing the lesson marks its
   task DONE.

## 5. Validation (client AND server, one shared rule file)

`shared/validation.ts` holds every rule. The frontend imports it for inline
errors under each input; the backend wraps the same functions in zod
(`backend/src/lib/validators.ts`). They cannot drift apart.

- **Email**: `local@domain.tld`, where the label before the TLD is at least 2
  characters and the TLD is at least 2 letters. Rejects `yd@g.com` and
  `a@b.c`, accepts `tristan@gmail.com`. Stored lower-cased.
- **Password**: 8-72 characters with at least one letter and one number, plus a
  strength hint on sign-up. 72 is bcrypt's input limit.
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

- **Users**: every account with role, tier and counts. Change role or tier.
  Delete requires typing the account's email. Admins cannot demote or delete
  themselves.
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
- **Data model**: the seven entities, their relationships in plain language, a
  diagram, and live row counts. Built for presentations.

## 11. Reports

**Reports** in the sidebar. Each report is a printable page (**Print / Save as
PDF** hides the app chrome) with a **Download CSV** of the same data:

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

## Production build check

```bash
cd backend && npx tsc --noEmit
cd frontend && npm run build    # the real test of Next 16 correctness
```

See `SECURITY.md` for the security model.
