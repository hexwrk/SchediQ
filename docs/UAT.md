# SchediQ: User Acceptance Test checklist

Run against a freshly seeded database (`cd backend && npx prisma db seed`, which
creates only `admin@schediq.app`; register student accounts during the test) with
the API on :4000 and the app on :3000. Tick each row; note any failure with the
step number.

| # | Area | Steps | Expected result | Pass |
| --- | --- | --- | --- | --- |
| 1 | Register: validation | Sign up with name blank, email `yd@g.com`, password `abcdefgh` | Inline errors under all three fields; nothing submitted | [ ] |
| 2 | Register: success | Sign up with a real name, `you@gmail.com`, `abc12345` | Lands on the dashboard; row visible in Prisma Studio (`npx prisma studio`) | [ ] |
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

Automated checks before a demo:

```bash
cd backend  && npx tsc --noEmit && npm test
cd frontend && npm run lint && npm run build
```
