# SchediQ — Setup

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
cp .env.example .env            # then set a real JWT_SECRET (already generated if you used the brief)
npm install
npx prisma migrate dev          # applies init + scheduling_prefs + session_completion migrations
npx prisma generate
npx prisma db seed              # demo user + 6 demo classmates + subjects/tasks + schedule + completed history
npm run dev                     # API on http://localhost:4000
```

Health check: `curl localhost:4000/api/health` -> `{"status":"ok"}`.

The backend `.env` needs:

```
DATABASE_URL="postgresql://schediq:schediq@localhost:5432/schediq"
JWT_SECRET="<a long random string>"
JWT_EXPIRES_IN="7d"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
AI_PARSER=rule
OPENAI_API_KEY=""
```

## 3. Frontend

```bash
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > .env.local
npm install
npm run dev                     # app on http://localhost:3000
```

## 4. Demo login

Open http://localhost:3000 and sign in with:

```
email:    demo@schediq.app
password: demo1234
```

You land on a populated dashboard: five subjects, 18 tasks, and a generated
weekly schedule, plus some already-completed study history so the gamification
HUD shows real XP, a streak and a rank on first login. Try **Add task** (type a
sentence, hit *Parse task*), **Subjects**, **Preferences** (saving offers to
regenerate), **Regenerate schedule** on the dashboard (it preserves completed
sessions), and clicking a study block to complete it (watch the +XP float and
HUD update, with a confetti burst / toast on a level-up or new badge).

## Gamification

- XP, level, streak, badges and the leaderboard are all **derived** from
  completed study sessions (`backend/src/lib/gamification.ts`, pure), never
  stored or hardcoded. XP for a session is `round(minutes/3)`, +25% when it
  follows another same-category session the same day (a focus bonus that
  rewards low task-switching).
- `GET /api/progress` returns `{ xp, level, levelProgress, streak, badges,
  leaderboard, rank, totalUsers }`. `PATCH /api/sessions/:id { completed }`
  toggles a session's completion.
- The leaderboard cohort is **seeded demo accounts** (`*@demo.schediq.app`),
  labelled "Demo cohort" in the UI. The ranking math is identical for every
  account, including yours. No real usage numbers are fabricated.

## 5. Switching the AI parser to OpenAI

The parser runs rule-based by default (no network, deterministic). To use the
OpenAI Structured-Outputs path:

1. In `backend/.env` set:
   ```
   AI_PARSER=openai
   OPENAI_API_KEY=sk-...
   ```
2. Restart `npm run dev` in `backend`.

The model is `gpt-4o-mini` (one constant, `MODEL`, in
`backend/src/controllers/ai.controller.ts`), temperature 0, with a
prompt-injection guard that treats the user's text as data. On any failure
(network, quota, bad JSON, schema mismatch) it falls back to the rule parser and
sets `source: "fallback"` on the response, so the endpoint never hard-fails.

## Production build check

```bash
cd frontend && npm run build    # the real test of Next 16 correctness
```
