# SchediQ: Test results

Captured on 14 November 2026 from `cd backend && npm test`, on branch
`feature/phase5-submission`, against the local docker-compose Postgres. The
output below is the unedited console output of that run.

## Summary

| Measure | Result |
| --- | --- |
| Test files | 10 (`backend/test/*.test.ts`) |
| Suites | 26 |
| Tests | 116 |
| Passed | 116 |
| Failed | 0 |
| Skipped | 0 |
| Duration | 3.1 s |

| File | Suites | Tests | Pass | Fail | What it covers |
| --- | --- | --- | --- | --- | --- |
| `validation.test.ts` | 4 | 39 | 39 | 0 | Shared email, password, username, number, name and time validators |
| `scheduler.test.ts` | 6 | 22 | 22 | 0 | Determinism, stable id tiebreak, placement rules, edge cases, spreading, `SWITCH_PENALTY`, course pacing |
| `production.test.ts` | 4 | 15 | 15 | 0 | Env validation, AI failure log redaction, admin temporary password, S3 backup config |
| `gamification.test.ts` | 3 | 10 | 10 | 0 | XP rules, focus bonus, quiz once, course completion, derived-not-stored, levels, streaks |
| `integration.test.ts` | 3 | 7 | 7 | 0 | Real Postgres: regenerate keeps completed sessions, per-user scoping, register/login/requireAuth revocation, OpenAI failure falls back |
| `mastery.test.ts` | 1 | 6 | 6 | 0 | 40/30/30 mastery formula, re-normalisation, cap, `asOf` weekly delta |
| `parser.test.ts` | 1 | 5 | 5 | 0 | Rule parser deadlines, durations, priority, title cleaning, junk input never throws |
| `tier.test.ts` | 2 | 5 | 5 | 0 | Tier caps off for the demo, still enforced when re-enabled, AI rate limit config |
| `taskProgress.test.ts` | 1 | 4 | 4 | 0 | Progress percent, minutes, next session, status rule |
| `jwt.test.ts` | 1 | 3 | 3 | 0 | Token version round-trip, legacy token, pinned HS256 |

Per-file counts were taken by running each file on its own with the same
command (`node --require ts-node/register --test <file>`).

`integration.test.ts` calls the real controllers and middleware against the
database in `DATABASE_URL`. It creates throwaway users and deletes them
afterwards; with no database it reports its tests as skipped instead of failing.

Additional static checks in the same session:

| Check | Command | Result |
| --- | --- | --- |
| Backend type check | `cd backend && npx tsc --noEmit` | exit 0, no errors |
| Frontend lint | `cd frontend && npm run lint` | exit 0, no findings |
| Frontend type check | `cd frontend && npx tsc --noEmit` | exit 0, no errors |

## Environment

| Component | Version |
| --- | --- |
| OS | Ubuntu 24.04.5 LTS (kernel 6.14.0-27-generic) |
| Node.js | v24.22.2 |
| PostgreSQL | 16.15 (docker image `postgres:16`) |
| Prisma / @prisma/client | 6.19.3 |
| TypeScript | 5.9.3 |
| Test runner | Node built-in `node:test` via `ts-node` (transpile only) |

## Full output

```

> backend@1.0.0 test
> TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test test/*.test.ts

▶ XP: per-fact rules
  ✔ awards 1 XP per 3 study minutes, +25% for a focus bonus (2.179013ms)
  ✔ gives the focus bonus only for a same-category session on the same day (0.98753ms)
  ✔ awards quiz XP once per lesson, however many retakes (0.410492ms)
  ✔ counts an active day once, however many facts fall on it (0.460166ms)
  ✔ awards course completion only when every lesson is complete (0.426996ms)
✔ XP: per-fact rules (6.168171ms)
▶ XP: derived from facts, never stored
  ✔ matches the hand-computed total for the worked example (0.609389ms)
  ✔ is order-independent: the same facts in any order give the same events (1.004915ms)
  ✔ removing a fact removes its XP (deleting a course takes its XP with it) (0.594639ms)
✔ XP: derived from facts, never stored (2.804105ms)
▶ levels and streaks
  ✔ uses the triangular level curve (L2 at 100, L3 at 300, L4 at 600) (0.705202ms)
  ✔ counts consecutive active days, tolerating no activity yet today (1.353008ms)
✔ levels and streaks (2.510802ms)
▶ regenerate schedule (POST /api/sessions/generate)
  ✔ keeps completed sessions, replaces only planned ones, and plans only the remaining minutes (200.048614ms)
  ✔ is scoped to the caller: another user's sessions are untouched (24.541418ms)
✔ regenerate schedule (POST /api/sessions/generate) (361.661561ms)
▶ auth handlers (register, login, requireAuth)
  ✔ register rejects a weak password with the shared rule, before touching the database (348.838287ms)
  ✔ register stores a bcrypt cost-12 hash and never returns it (265.310515ms)
  ✔ login gives the same 401 for an unknown email and a wrong password, and a token for the right one (977.324734ms)
  ✔ requireAuth accepts a current token and rejects it once tokenVersion moves on (36.124876ms)
✔ auth handlers (register, login, requireAuth) (1628.179382ms)
▶ AI parse (POST /api/ai/parse) with the model unavailable
  ✔ falls back to the rule parser and still answers 200 (464.960845ms)
✔ AI parse (POST /api/ai/parse) with the model unavailable (465.217292ms)
▶ JWT token version
  ✔ round-trips userId and tokenVersion (322.002162ms)
  ✔ reads a pre-revocation token (no tv claim) as version 0, so deploying logs nobody out (1.713287ms)
  ✔ rejects a token signed with another algorithm or secret (1.84272ms)
✔ JWT token version (327.028661ms)
▶ mastery formula
  ✔ no data at all scores 0 (1.868056ms)
  ✔ weights 40 lessons / 30 quizzes / 30 study when all apply (0.61349ms)
  ✔ re-normalises when a subject has no course (study only, out of 100) (0.23951ms)
  ✔ study component is capped at 1 (0.243051ms)
  ✔ first lesson + perfect quiz on a 5-lesson course with no study = 14 (the live demo jump) (0.284963ms)
  ✔ asOf only counts facts up to that instant (weekly change) (0.259479ms)
✔ mastery formula (5.619882ms)
▶ rule parser
  ✔ weekday deadlines resolve to the next occurrence (3.989773ms)
  ✔ handles a weekday glued to 'due' and cleans the title (0.38097ms)
  ✔ does not mistake words containing weekday letters for deadlines (0.594093ms)
  ✔ still parses month dates, durations and priority (0.284742ms)
  ✔ never throws on junk input (it is the fallback, so it must always succeed) (1.46748ms)
✔ rule parser (8.522074ms)
▶ env validation
  ✔ accepts a complete production config and normalises it (2.824092ms)
  ✔ fails fast on a missing or short JWT_SECRET (0.919772ms)
  ✔ requires DATABASE_URL, CORS_ORIGIN, PORT and AI_PARSER (0.687014ms)
  ✔ requires OPENAI_API_KEY only when AI_PARSER=openai, and reports it with other errors (0.542139ms)
  ✔ rejects "*" and non-origin values in CORS_ORIGIN (0.454944ms)
  ✔ parses DEMO_MODE strictly (no Boolean('false') trap) (0.359625ms)
  ✔ never echoes secret values in the error message (0.292029ms)
✔ env validation (7.064311ms)
▶ AI failure logging
  ✔ logs status and code but redacts anything shaped like an API key (0.369087ms)
✔ AI failure logging (0.551556ms)
▶ admin temporary password
  ✔ meets the shared password rule, is unambiguous and is unique per call (7.141945ms)
✔ admin temporary password (7.293668ms)
▶ Cloud (S3-compatible) backup config
  ✔ is configured only when all five values are set (0.697296ms)
  ✔ rejects an S3_ENDPOINT that is not a URL (0.235317ms)
  ✔ stores under backups/ with a ~1 hour download link (0.068468ms)
  ✔ validates BACKUP_SCHEDULE as daily or a cron expression (1.535943ms)
  ✔ maps provider errors to actionable messages without echoing them (0.139337ms)
  ✔ never logs keys or signatures (0.276264ms)
✔ Cloud (S3-compatible) backup config (3.158922ms)
▶ scheduler: determinism
  ✔ returns identical output for identical input (5.180086ms)
  ✔ does not depend on input order (stable id tiebreak) (0.762377ms)
✔ scheduler: determinism (7.74107ms)
▶ scheduler: placement rules
  ✔ never places a block in the past (starts at now rounded up to 5 min) (1.28933ms)
  ✔ respects maxDailyMins and never overlaps blocks (1.349395ms)
  ✔ keeps placing IN_PROGRESS tasks (the caller passes the remaining minutes) (0.701587ms)
  ✔ never overlaps kept (completed) blocks, and counts them toward the daily limit (0.880208ms)
  ✔ skips DONE tasks (0.704271ms)
✔ scheduler: placement rules (6.076805ms)
▶ scheduler: edge cases
  ✔ deadline in the past: scheduled as soon as possible and flagged OVERDUE (19.11801ms)
  ✔ task longer than maxDailyMins is split across days (0.818764ms)
  ✔ task that cannot fit before its deadline is kept and flagged AT_RISK (1.334482ms)
  ✔ no tasks: empty schedule and no issues (0.419522ms)
  ✔ no saved preferences: defaults produce a valid schedule (0.359675ms)
  ✔ zero capacity: nothing placed, every task reported UNSCHEDULED with the reason (0.410055ms)
  ✔ large input: stays fast, respects the horizon, and reports the overflow (51.545876ms)
✔ scheduler: edge cases (75.119461ms)
▶ scheduler: spreads work instead of front-loading
  ✔ a 6-hour task due in 7 days is spread across the week, not packed into 3 days (1.446329ms)
  ✔ no day is overloaded while a later day before the deadline sits empty (0.554619ms)
  ✔ a short task stays one block instead of being shredded across days (0.357396ms)
  ✔ each task gets ONE block per day, split only above MAX_FOCUS_MIN (0.424432ms)
  ✔ keeps the 1.5x switch-penalty break between different cognitive categories (0.501568ms)
✔ scheduler: spreads work instead of front-loading (3.82153ms)
▶ scheduler: course lesson pacing
  ✔ spreads a course's lessons at most 1 per day (0.608119ms)
  ✔ two different courses may each have a lesson on the same day (0.373087ms)
✔ scheduler: course lesson pacing (1.213197ms)
▶ scheduler: determinism of the spread
  ✔ is byte-identical across runs with a mixed workload (0.812406ms)
✔ scheduler: determinism of the spread (0.987888ms)
▶ task progress (derived from sessions)
  ✔ 0 / 1 / 2 / 3 of 3 sessions -> 0% / 33% / 67% / 100% (2.957656ms)
  ✔ reports minutes, counts and the next session (0.976468ms)
  ✔ no sessions: total falls back to the task duration, 0% (0.303701ms)
  ✔ status follows progress (0.30532ms)
✔ task progress (derived from sessions) (7.147943ms)
▶ tier limits (demo: Free includes everything)
  ✔ has the cap switch off, so no account is ever gated (1.050933ms)
  ✔ gives FREE unlimited AI parses and courses (no 402 possible) (0.300751ms)
  ✔ still caps FREE (and only FREE) when the switch is turned back on (0.22085ms)
✔ tier limits (demo: Free includes everything) (3.41972ms)
▶ AI rate limit (abuse guard, env-configurable)
  ✔ defaults to a generous 200 per hour (4.077106ms)
  ✔ reads AI_RATE_LIMIT_PER_HOUR and rejects nonsense (2.747692ms)
✔ AI rate limit (abuse guard, env-configurable) (7.222858ms)
▶ shared email validator
  ✔ accepts tristan@gmail.com (1.144024ms)
  ✔ accepts first.last+tag@uni.ac.za (0.364477ms)
  ✔ accepts a1@mail.co.uk (0.231837ms)
  ✔ accepts Name@Example.ORG (0.189525ms)
  ✔ rejects "yd@g.com" (1-char registrable label) (0.283339ms)
  ✔ rejects "a@b.c" (1-char TLD) (0.132755ms)
  ✔ rejects "" (empty) (0.125646ms)
  ✔ rejects "no-at-sign.com" (no @) (0.123683ms)
  ✔ rejects "two@@gmail.com" (two @) (0.155266ms)
  ✔ rejects "@gmail.com" (empty local part) (0.342973ms)
  ✔ rejects "user@" (empty domain) (0.138073ms)
  ✔ rejects "user@gmail" (no TLD) (0.112379ms)
  ✔ rejects "user@gmail.c0m" (numeric TLD) (0.084142ms)
  ✔ rejects ".user@gmail.com" (leading dot) (0.096986ms)
  ✔ rejects "us..er@gmail.com" (double dot) (0.098684ms)
  ✔ rejects "user@-gmail.com" (label starts with hyphen) (0.078671ms)
  ✔ rejects "user name@gmail.com" (space) (0.13752ms)
✔ shared email validator (5.928533ms)
▶ shared password validator
  ✔ accepts a strong password (1.355584ms)
  ✔ reports EVERY failing rule, one message each (0.530967ms)
  ✔ rejects a password containing the username or email name (case-insensitive) (0.273063ms)
  ✔ rejects common passwords even when dressed up to pass composition (0.196783ms)
  ✔ grades strength; anything failing a rule is weak (0.233787ms)
✔ shared password validator (2.87088ms)
▶ shared username validator
  ✔ normalises (trim + lower-case) before checking (0.328399ms)
  ✔ rejects "" (0.148319ms)
  ✔ rejects "ab" (0.108586ms)
  ✔ rejects "aaaaaaaaaaaaaaaaaaaaa" (0.03711ms)
  ✔ rejects "john doe" (0.064128ms)
  ✔ rejects "1john" (0.064947ms)
  ✔ rejects "_john" (0.154693ms)
  ✔ rejects "john.doe" (0.094335ms)
  ✔ rejects "jöhn" (0.402399ms)
  ✔ rejects "admin" (0.127884ms)
  ✔ rejects "ROOT" (0.09993ms)
  ✔ reports every failing rule (0.130106ms)
  ✔ accepts valid names (0.192761ms)
  ✔ the backfill migration reserves exactly the shared list (0.630298ms)
✔ shared username validator (3.267537ms)
▶ shared number / name / time validators
  ✔ number rules give specific messages (0.446067ms)
  ✔ name is required and whitespace counts as blank (0.213017ms)
  ✔ time window end must be after start (0.403894ms)
✔ shared number / name / time validators (1.304743ms)
ℹ tests 116
ℹ suites 26
ℹ pass 116
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3081.336125
```
