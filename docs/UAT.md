# SchediQ: User Acceptance Test checklist

Run against a freshly seeded database (`cd backend && npx prisma db seed`, which
creates only `admin@schediq.app`, password `Study-Plan-2026!`; register student accounts during the test) with
the API on :4000 and the app on :3000. Tick each row; note any failure with the
step number.

| # | Area | Steps | Expected result | Pass |
| --- | --- | --- | --- | --- |
| 1 | Register: validation | Sign up with name blank, email `yd@g.com`, username `1 Bad.Name`, password `password` | Inline errors under every field; the username lists each broken rule (spaces, must start with a letter, allowed characters); the password checklist shows red crosses for length, uppercase, number, symbol and "Not a common password", strength Weak; Sign up stays disabled | [ ] |
| 2 | Register: success | Sign up with a real name, username `  You_2026 `, `you@gmail.com`, `Correct-Horse-42` | Username shows "you_2026 is available"; every checklist line ticks green; lands on the dashboard; Account shows `@you_2026`; row visible in Prisma Studio | [ ] |
| 3 | First run | As the new account, open the Dashboard | 3-step onboarding checklist, "No study blocks this week" with an Add a task button. No blank widgets | [ ] |
| 4 | Empty states | Open Task list, Subjects, Courses | Each explains what goes there and links to the next action | [ ] |
| 5 | Login / forgot password | Log out, click "Forgot password?", enter the email | Generic message plus (demo mode) "Open reset link"; setting a new password works; the old one is rejected; reusing the link fails | [ ] |
| 6 | Subjects | Add a subject; try a duplicate name; try a blank name | Created; duplicate and blank rejected inline | [ ] |
| 7 | Add task (AI parse) | Type "ASR homework, 2 hours, due Tuesday", Parse, Save | Title "ASR homework", 120 min, deadline next Tuesday 23:59; saved to Task list | [ ] |
| 8 | Task validation | Edit a task: duration `-5`, then `abc`, then blank | A specific message each time; Save blocked | [ ] |
| 9 | Schedule | Dashboard, Regenerate schedule | Blocks appear in the 09:00-21:00 window, none earlier than now today, max 180 min/day | [ ] |
| 10 | Past deadline | Add a task with yesterday's deadline, regenerate | Scheduled today as soon as possible; "Overdue" in Needs attention with the reason | [ ] |
| 11 | Oversized / cannot fit | Add a 480-min task due tomorrow, regenerate | Split across days (≤180/day); "At risk" with the reason. Nothing disappears | [ ] |
| 12 | Complete a block | Click a study block | "+N XP" float; HUD XP and streak update; still there after reload | [ ] |
| 13 | Course generator | Courses, generate "SQL joins", Beginner, 3 lessons, link a subject | Course opens with 3 lessons, progress 0/3 | [ ] |
| 14 | Lesson + quiz | Open lesson 1, answer the quiz, Submit | Score shown with correct answers; "+50 XP" if passed; course bar 1/3; subject mastery rises on the Dashboard; persists after reload | [ ] |
| 15 | Lesson <-> task | "Add this course to my schedule", regenerate, complete that lesson's study blocks | The lesson shows Completed in the course | [ ] |
| 16 | Tier gate | As a FREE account that already has 2 courses, generate a third | "Upgrade to Premium" prompt, not an error; after Upgrade (demo) generating works | [ ] |
| 17 | Reports | Reports, open each; change the date range; Print; Download CSV | Title, date, your name, totals, chart(s), table; figures change with the range; print view hides the app chrome; CSV opens in a spreadsheet | [ ] |
| 18 | Admin gate | As a normal user, open `/admin` | "Access denied" page; API returns 403 | [ ] |
| 19 | Admin | As `admin@schediq.app`: change a user's tier, view Data model, Create backup | Changes apply; diagram shows live counts; a `.sql` file downloads | [ ] |
| 20 | Restore (scratch DB only) | Restore the backup file after typing RESTORE | Success message; data matches the backup | [ ] |
| 21 | Delete course | Delete a course | Its lessons are gone, its tasks stay (unlinked), XP from it is removed | [ ] |
| 22 | Delete account | Account, wrong password; then correct password + DELETE | Wrong password rejected inline; then logged out and the account is gone | [ ] |
| 23 | Errors | Stop the API, reload the Dashboard | Friendly "Can't reach the SchediQ server" with Try again (no blank page); restart the API and Retry recovers | [ ] |
| 24 | Phone width | DevTools device mode at 390 px; open the menu; visit every page | Menu drawer opens and closes; no page scrolls sideways (calendar and tables scroll inside their box) | [ ] |
| 25 | Install (PWA) | Chrome, install icon in the address bar | Installs as "SchediQ" with the SQ icon and opens in its own window | [ ] |
| 26 | Spread, not front-load | Add one 360-min task due in 7 days (nothing else), generate | About 45 min on each day up to the deadline; no day full while later days sit empty |
| 27 | Course pacing | "Add this course to my schedule" on a 5-lesson course, regenerate | One lesson of that course per day, across 5 days |
| 28 | Dark mode | Top-bar theme button: Light, then Dark, then System; reload; navigate; print a report in Dark | Theme switches instantly, survives reload and navigation, no light flash on load; text readable everywhere; printout is light |
| 29 | Task progress | Add a 150-min task due in 2 days, generate (3 blocks), tick the blocks one by one on the calendar; regenerate after the first | Bar reads 33% -> 67% -> 100% and the task shows done; "In progress" panel updates without reloading; regenerating keeps 33% and adds no extra blocks |
| 30 | Admin password reset | As admin, Users > Reset password on a student > Issue; log in as the student with it; Account > Change password | Temporary password shown once; banner after login; after changing, banner gone and the temporary password no longer works |
| 31 | Production lockdown | Run the API with `DEMO_MODE=false`; Forgot password; open System & backup | Only the generic message, no link on screen; "Production backups are managed by Neon", buttons disabled |
| 32 | Rate limits | Wrong password 11 times in a row; 21 AI parses within an hour (Premium account) | 11th login gets "Too many login attempts" (429); 21st parse gets "AI request limit reached" (429) |
| 33 | Fail-fast config | Start the API with `JWT_SECRET` removed from `.env` | Exits immediately listing "JWT_SECRET is required and must be at least 32 characters" |
| 34 | Sign out everywhere | Log in as a student in two browsers; in browser 1 change the password on Account; in browser 2 click any page | Browser 1 stays signed in; browser 2 lands on Log in with "Your session has ended..." |
| 35 | Password rules, server side | `curl -s -H 'Content-Type: application/json' -d '{"email":"x.y@gmail.com","username":"ab","password":"Password123!","name":"X"}' localhost:4000/api/auth/register` | `400`; `details.fieldErrors.username` = "at least 3 characters"; `details.fieldErrors.password` = "too common" (one message per failing rule) | [ ] |
| 36 | Password: personal + common | Register with username `tristan_j` and password `My-Tristan_J-99`; then `P@ssw0rd!2026` | First: "must not contain your username or the name part of your email"; second: "Not a common password" fails; button disabled both times | [ ] |
| 37 | Username taken / reserved | Register with `admin`, then with an existing account's username | "That username is reserved"; then "That username is already taken" (live, and `409` if submitted) | [ ] |
| 38 | Reset / change password checklist | Forgot password link; type `short`; then Account > Change password with a password containing your email name | Live checklist + meter on both; Reset button disabled until the rules pass; Change password rejected with the personal-info message | [ ] |
| 39 | Username backfill | On a DB with accounts created before this release: `npx prisma migrate deploy`, then `select email, username from "User"` | Migration applies with no error; every row has a unique 3-20 char lowercase username from its email (e.g. `first.last@x` -> `first_last`, duplicates get `1`, `2`...) | [ ] |
| 40 | Search + delete | Tasks: type part of one task's title; Delete it; clear the search. Repeat on Subjects and Courses. Admin Users: search by part of an email, then a username | List narrows with "N of M shown"; a no-match query shows "No matching..." with Clear search; delete asks to confirm and removes only that row; admin search hits the server (`/api/admin/users?q=` in DevTools Network) | [ ] |
| 41 | PDF reports | Reports > Study schedule, Workload summary, Progress report: Download PDF on each | A `.pdf` file downloads (no print dialog) with title, generated date, your name/username/email, period, summary totals, bar chart(s) and the table(s), matching the screen; opens in any PDF viewer | [ ] |
| 42 | Cloud backup not configured | With no `S3_*` vars, open System & backup | "Configure cloud backup" box with a link to the setup guide; no error; `POST /api/admin/backup/cloud` returns `409 STORAGE_NOT_CONFIGURED`; local Create backup still works | [ ] |
| 43 | Cloud backup | Set the five `S3_*` vars (docs/CLOUD_BACKUP.md), restart, click Back up to cloud (off-site) | Success with a Download link (expires in ~1 hour) that downloads `schediq-backup-<timestamp>.sql.gz` (or `.json.gz`); the object is under `backups/` in the bucket; "Last cloud backup" updates; `BackupLog` has a row with `destination = s3` and the object key | [ ] |
| 44 | Restore a cloud backup (scratch DB) | Download the `.sql.gz` via the link, upload it on Restore, type RESTORE | Restores like a `.sql` file | [ ] |

Automated checks before a demo:

```bash
cd backend  && npx tsc --noEmit && npm test
cd frontend && npm run lint && npm run build
```
