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
npx prisma migrate dev          # applies init + scheduling_prefs migrations
npx prisma generate
npx prisma db seed              # demo user + subjects + tasks + a generated schedule
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

You land on a populated dashboard: four subjects, four tasks, and a generated
weekly schedule. Try **Add task** (type a sentence, hit *Parse task*),
**Subjects**, **Preferences** (saving offers to regenerate), and
**Regenerate schedule** on the dashboard.

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
