# SchediQ: Deployment (Vercel + Render + Neon)

| Part | Platform | Directory | URL example |
| --- | --- | --- | --- |
| Database | Neon (PostgreSQL 16) | n/a | `ep-xxx-pooler.eu-central-1.aws.neon.tech` |
| API | Render Web Service (Node) | `backend/` + `shared/` | `https://schediq-api.onrender.com` |
| Frontend | Vercel (Next.js 16) | `frontend/` + `shared/` | `https://schediq.vercel.app` |

Order matters because each service needs the previous one's URL:
**Neon, then Render, then Vercel, then back to Render for CORS.**

Deploy from `main` (merge the feature branch first).

## Why `shared/` affects both build configs

`shared/validation.ts` lives at the repo root and is compiled into BOTH apps,
so the browser and the API enforce identical rules. Neither app can be built
from its own folder alone:

- **Backend:** `tsconfig.json` has `rootDir: ".."`, so `npm run build` emits
  `dist/backend/src/**` and `dist/shared/validation.js`. `npm start` runs
  `node dist/backend/src/index.js`. Render must check out the whole repo, which
  is why its Root Directory is left **blank** (see step 2).
- **Frontend:** `next.config.ts` sets `turbopack.root` and
  `outputFileTracingRoot` to the repo root, and `@shared/*` maps to
  `../shared/*`. On Vercel the Root Directory stays `frontend`, with **Include
  files outside the root directory in the Build Step** enabled.
- **Build preflight:** `frontend/scripts/check-build-env.mjs` runs as
  `prebuild`. It fails the build with the exact fix if `../shared` is missing,
  or if `NEXT_PUBLIC_API_URL` is unset on Vercel.

Both layouts were verified from a clean checkout containing only `frontend/` +
`shared/` (Vercel) or `backend/` + `shared/` (Render).

## 1. Neon (PostgreSQL)

1. Create a project. Pick the region closest to your Render region (e.g.
   Frankfurt for both).
2. From **Connect**, copy two connection strings for the same database and role:
   - **Pooled** (host contains `-pooler`): this is `DATABASE_URL`, used by the
     running API.
   - **Direct** (no `-pooler`): this is `DIRECT_URL`, used only by
     `prisma migrate deploy`. Migrations need a session connection that a
     transaction-mode pooler does not give.
3. Make sure both strings end with `?sslmode=require&connect_timeout=15`.
   - `connect_timeout` covers a Neon compute waking from suspend.
   - If the API ever logs `prepared statement "s0" already exists`, append
     `&pgbouncer=true` to `DATABASE_URL` only. Neon's pooler normally handles
     Prisma's prepared statements, so check it in practice.

`schema.prisma` declares both:
`datasource db { url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }`.

Verified locally:
- Migrations and the API ran against a TLS-only Postgres with
  `sslmode=require` (sessions showed TLS 1.3).
- Requiring TLS from a server without it fails loudly (`P1011`).

The Neon pooler itself could not be tested offline.

**Backups:** Neon keeps automatic backups with point-in-time restore. The
in-app Backup/Restore is a local/demo feature. In production the admin System
page shows "Production backups are managed by Neon", with its buttons disabled.

## 2. Render (Express API)

**New > Web Service**, then connect the GitHub repo.

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | *(leave blank: the build needs `shared/`)* |
| Runtime | Node |
| Build Command | `cd backend && npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build` |
| Start Command | `cd backend && npm start` |
| Health Check Path | `/api/health` |
| Build Filters, Included Paths | `backend/**`, `shared/**` (so frontend-only commits don't redeploy the API) |

Why `npm ci --include=dev`:
- With `NODE_ENV=production` set, a plain `npm install` or `npm ci` skips
  devDependencies.
- The build needs them: `typescript`, the `@types/*` packages, and `ts-node`
  for the seed.
- The runtime only uses `dist/` plus production dependencies.

Use `/api/health` for Render's health check, not `/api/health/db`. A Neon
compute waking up must not make Render restart a healthy API. Point an uptime
monitor at `/api/health/db` instead.

**Environment variables.** Every one is validated at boot by
`backend/src/lib/env.ts`. A missing or invalid value fails the deploy and lists
every problem, with no secrets printed.

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `20` (the backend's `engines` field requires >= 20.9) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** string |
| `DIRECT_URL` | Neon **direct** string |
| `JWT_SECRET` | output of `openssl rand -base64 48` (min 32 chars) |
| `JWT_EXPIRES_IN` | `7d` |
| `AI_PARSER` | `openai` |
| `OPENAI_API_KEY` | your key (required when `AI_PARSER=openai`) |
| `DEMO_MODE` | `false` |
| `CORS_ORIGIN` | `http://localhost:3000` for now (replaced in step 4) |
| `APP_URL` | optional; defaults to the first `CORS_ORIGIN` (used in reset links) |
| `S3_ENDPOINT` | optional; off-site backup to S3-compatible storage (`docs/CLOUD_BACKUP.md`) |
| `S3_REGION` | optional; `auto` for R2, e.g. `us-west-004` for B2 |
| `S3_BUCKET` | optional; private bucket for backups |
| `S3_ACCESS_KEY_ID` | optional; key scoped to that bucket |
| `S3_SECRET_ACCESS_KEY` | optional; secret, set in Render only |
| `BACKUP_SCHEDULE` | optional; `daily` or a cron expression (needs all five `S3_*` vars) |

Leave `PORT` unset. Render injects it, and the API listens on it.

Deploy, then note the service URL, e.g. `https://schediq-api.onrender.com`.
Check it:

```bash
curl https://schediq-api.onrender.com/api/health      # {"status":"ok"}
curl https://schediq-api.onrender.com/api/health/db   # {"status":"ok","latencyMs":...}
```

**Seed the admin once.**
- Render Shell is not available on free instances, so run the seed from your
  machine against Neon's **direct** URL.
- Production refuses to seed without `SEED_ADMIN_PASSWORD`, so the published
  local default password is never used online.

```bash
cd backend
NODE_ENV=production \
DATABASE_URL='<neon direct url>' DIRECT_URL='<neon direct url>' \
SEED_ADMIN_PASSWORD='<12+ chars, upper, lower, number, symbol, not containing "admin">' \
npx prisma db seed
```

The password stays in your shell history; clear it or prefix the line with a
space if `HIST_IGNORE_SPACE` is set. Re-running the seed only resets the admin
account. After logging in you can also change the password on
**Account > Change password**.

**Free tier:** the service sleeps after about 15 minutes idle. The first request
afterwards takes about 30 to 60 seconds. Fine for a demo; say so if asked.

## 3. Vercel (Next.js frontend)

**Add New > Project**, then import the same repo.

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `frontend` |
| Include files outside the root directory in the Build Step | **Enabled** (Settings > Build and Deployment, under Root Directory; on by default for new projects, but check) |
| Install Command | default (`npm install`) |
| Build Command | default (`npm run build`, which runs the `prebuild` preflight first) |
| Output Directory | default (`.next`) |
| Node.js Version | 20.x (or 22.x) |

Environment variable (Production, and Preview if you use preview deploys):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://schediq-api.onrender.com` (no trailing slash) |

`NEXT_PUBLIC_*` is inlined into the browser bundle **at build time**. After
changing it, redeploy; restarting is not enough.

Deploy and note the URL, e.g. `https://schediq.vercel.app`.

## 4. Close the loop (CORS)

1. In Render, set `CORS_ORIGIN` to the Vercel URL, comma-separated with any
   custom domain:
   `https://schediq.vercel.app,https://schediq.example.com`
   - Exact origins only: scheme and host, no path, no trailing `/` needed.
   - `*` is refused at boot.
   - Vercel **preview** URLs are different origins. Add one explicitly if you
     need it.
2. Saving the variable redeploys the service.
3. Open the Vercel URL and register.
   - In DevTools > Network, API calls should show
     `access-control-allow-origin: https://schediq.vercel.app`.
   - A CORS error means the origin string does not match exactly.

## 5. Post-deploy checklist

- [ ] Log in as `admin@schediq.app` with your `SEED_ADMIN_PASSWORD`.
- [ ] Register a fresh account. It persists after a reload, and appears in the
      Neon console under Tables > User.
- [ ] Add task > Parse: the response `source` is `"openai"`. Generate a course:
      its `source` is `"AI"`. The course API labels the model path `AI` and the
      offline templates `SEED`.
- [ ] Forgot password returns only "If an account exists...", with no link on
      screen. The link appears only in Render's logs (`[reset] ...`).
- [ ] Admin > Users > **Reset password** shows a temporary password once.
      - Logging in with it shows the "temporary password" banner.
      - Changing it on Account clears the banner.
      - The temporary password then stops working.
      - A second browser that was logged in as that user gets sent to the
        login page with a "session has ended" notice on its next action.
- [ ] Admin > System & backup shows "Production backups are managed by Neon",
      with the buttons disabled and no error.
- [ ] Rate limits return 429 (run from your machine):
      ```bash
      for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -X POST \
        -H 'content-type: application/json' -d '{"email":"x@gmail.com","password":"Wrong12345"}' \
        https://schediq-api.onrender.com/api/auth/login; done; echo
      # 401 x10, then 429 (10 per 15 minutes per IP per auth endpoint)
      ```
      AI endpoints allow 20 requests per hour per user.
- [ ] Dark mode, progress bars, mastery, reports (print + CSV) and PWA install
      work on the live URL, at desktop and phone width.
- [ ] HTTPS on all three (automatic). The API sends HSTS, `nosniff`, a strict
      CSP and no `X-Powered-By`.

## 6. Costs

- The Neon, Render and Vercel free tiers cover a student project.
- Render free means cold starts after idle time.
- OpenAI calls cost real money per call. Several controls bound it:
  - tier caps (FREE: 5 parses/day, 2 courses)
  - the AI rate limit (20/hour/user)
  - output token caps (300 for a parse, 400 + 1100 per lesson for a course)
  - a 20 s timeout with a single retry
  Check the current `gpt-4o-mini` price in the OpenAI dashboard before quoting
  a figure.

## 7. Operational notes and deferred work

- **Password reset email:** not built yet. Production recovery is the admin
  temporary password. The reset link is written to the Render log, so treat log
  access as sensitive. Add a transactional mailer (e.g. Resend) and send the
  link there instead.
- **Payments:** the Premium tier is a labelled demo ("billing coming soon").
  Add Stripe later.
- **Rate limit store:** in memory, which is correct for one Render instance.
  Scaling to several instances needs a shared store (Redis) so the counters are
  global.
- **Session revocation:** handled by `User.tokenVersion`. A password change,
  a used reset link or an admin temporary password signs the user out on every
  device. It costs one primary-key lookup per authenticated request, which is
  negligible on Neon's pooled connection.
- **Database role:** connect as a non-superuser role. Neon's default role is
  not a Postgres superuser.
- **Logs:** one access log line per request (no bodies or headers). Errors are
  logged in full on the server and returned to clients as generic messages.
  OpenAI failures log status and error code only, never the key or the prompt.
