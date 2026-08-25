# Build Brief (Frame) — SchediQ

Origin: concept seeded by "DevLog". Build target: SchediQ per IT Project 700/600 spec.

## What it is
Web app that takes a student's free-text academic tasks, parses them, and schedules
them against daily study limits — clustering cognitively-similar subjects to cut
task-switching cost. Deterministic rule-based scheduler; AI used ONLY for parsing.

## Stack (fixed by campus spec — do not substitute)
- Frontend:  React / Next.js (deployable as cross-device PWA)
- Backend:   Node.js / Express — REST API
- Database:  PostgreSQL
- Auth:      JWT (stateless)
- AI parse:  OpenAI API (GPT-4o) — free-text -> structured fields only
- Deploy:    Vercel

## Data model — 5 core entities
Users · Subjects · Tasks · Study Sessions · Preferences
- Subjects carry cognitive_category (scheduler input) + color_tag (display only)
- Study Sessions are derived by the scheduler, FK-linked to Tasks; calendar renders from these
[define fields per ER diagram when building]

## REST API contract — one resource set per entity
/api/auth  · /api/subjects · /api/tasks · /api/sessions · /api/preferences
[endpoint list + request/response shapes TBD]

## Core systems (stub in frame, spec when building)
1. AI parser — free text -> {title, subject, deadline, duration, priority}. [prompt/schema TBD]
2. Scheduling engine — deterministic; sort by deadline+priority, pack into daily slots
   bounded by max_daily_mins + preferred window. Same input -> same schedule. [rules TBD]
3. Clustering — group by subject; widen break when cognitive_category switches. [penalty TBD]

## Screens
Auth · Workload input (AI parse) · Calendar dashboard · Task list (CRUD) · Preferences

## Requirements to satisfy (from Phase 2 SRS)
Functional:  token auth · free-text parse · manual entry/edit · daily-limit-aware weekly
             schedule · related-subject clustering · calendar CRUD · editable preferences · PG persistence
Non-func:    parse < few sec · SUS-measured usability · hashed passwords + token-gated routes ·
             deterministic scheduler · Vercel availability · front/back/AI layers separated

## Workflow
Agile, 2-week sprints. GitHub main / develop / feature branching.
Build order (per Phase 4):
  Sprint 1 — Auth + task CRUD
  Sprint 2 — AI parser (+ manual fallback)
  Sprint 3 — Scheduling engine + clustering + calendar view

## MVP tiers (ship gate = end of Development month)
  Tier 1 (must):    auth · task input + AI parse · scheduler w/ daily constraints · calendar
  Tier 2 (target):  clustering algorithm · full preferences panel
  Tier 3 (stretch): drag-drop reschedule · study analytics dashboard
