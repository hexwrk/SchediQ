# SchediQ

AI-assisted study scheduler: takes free-text academic tasks, parses them, and
schedules them against daily study limits, clustering cognitively-similar
subjects to cut task-switching cost. See [docs/FRAME.md](docs/FRAME.md) for
the full build brief.

## Stack

- `frontend/` — Next.js (App Router, TypeScript, Tailwind)
- `backend/` — Node.js / Express REST API (TypeScript, Prisma, PostgreSQL)
- Auth — JWT, bcrypt-hashed passwords
- AI parsing — OpenAI API (Sprint 2)

## Sprint 1 scope (current)

Auth (register/login/me) and task CRUD, with subjects and preferences
scaffolded for later sprints. The scheduling engine, clustering, and AI
parser land in Sprints 2–3.

## Getting started

### Backend

```
cd backend
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm install
npm run prisma:migrate
npm run dev             # http://localhost:4000
```

### Frontend

```
cd frontend
cp .env.local.example .env.local
npm install
npm run dev              # http://localhost:3000
```

## API (Sprint 1)

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/subjects`, `PUT/DELETE /api/subjects/:id`
- `GET/POST /api/tasks`, `GET/PUT/DELETE /api/tasks/:id`
- `GET/PUT /api/preferences`
- `GET /api/sessions` (stub — populated by the scheduler in Sprint 3)

All routes except `/api/auth/register` and `/api/auth/login` require a
`Authorization: Bearer <token>` header.
