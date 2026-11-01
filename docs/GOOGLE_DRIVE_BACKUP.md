# Google Drive backup: one-time setup (~10 min)

Off-site backup for SchediQ. The admin System page has a **Back up to Google
Drive** button that dumps the whole database (`pg_dump`, or the JSON export
where `pg_dump` is not installed), gzips it and uploads it to one Google
account's Drive. The local **Create backup** download still works as before.

You need three env values: a client ID, a client secret and a refresh token.
A folder ID is optional (the app makes its own folder if you skip it). There is
no OAuth server to code and no Google verification needed, because the scope is
`drive.file` (non-sensitive).

## 1. Create a project and enable the Drive API

1. Go to https://console.cloud.google.com and create (or pick) a project.
2. APIs & Services > Library > search "Google Drive API" > Enable.

## 2. Configure the consent screen

1. APIs & Services > OAuth consent screen.
2. User type: External. Fill in the app name and your email. Save.
3. IMPORTANT: set the publishing status to **In production** (not Testing).
   `drive.file` is a non-sensitive scope, so Production needs no verification.
   It also avoids the Testing-mode trap where refresh tokens die after 7 days,
   which would break a demo held a week later.

## 3. Create OAuth client credentials

1. APIs & Services > Credentials > Create credentials > OAuth client ID.
2. Application type: **Web application**.
3. Under Authorized redirect URIs add exactly:
   `https://developers.google.com/oauthplayground`
4. Create. Copy the **Client ID** and **Client secret**.

## 4. Get a refresh token (Google's OAuth Playground, no code)

1. Open https://developers.google.com/oauthplayground
2. Click the gear icon (top right), tick **Use your own OAuth credentials**, and
   paste your Client ID and Client secret.
3. On the left, in "Input your own scopes", enter:
   `https://www.googleapis.com/auth/drive.file`
4. Click **Authorize APIs**, sign in with the Google account whose Drive should
   hold the backups, and allow.
5. On Step 2, click **Exchange authorization code for tokens**. Copy the
   **Refresh token** value.

## 5. (Optional) Folder ID

Skip this and the app creates its own **SchediQ Backups** folder on the first
upload, then reuses it.

Gotcha: with the `drive.file` scope the app can only see files and folders **it
created**. A folder you make by hand in the Drive web UI is invisible to it, so
its ID will not work: the app logs a warning and falls back to its own
**SchediQ Backups** folder. To pin a specific folder, run one Drive backup
first, open the **SchediQ Backups** folder it created, and copy the ID from the
URL `drive.google.com/drive/folders/<THIS_PART>`. You can rename or move that
folder in Drive; the ID stays the same.

## 6. Set the env vars

Local (`backend/.env`) and, for production, in Render:

```
GOOGLE_DRIVE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=xxxxx
GOOGLE_DRIVE_REFRESH_TOKEN=1//xxxxx
# optional: a folder the app created (see step 5)
GOOGLE_DRIVE_FOLDER_ID=xxxxx
# optional automatic backup: "daily" (03:00 server time) or a cron expression
BACKUP_SCHEDULE=daily
```

Restart the backend, open the admin **System & backup** page and click **Back
up to Google Drive**. A file like `schediq-backup-2026-11-01T09-23-39Z.sql.gz`
appears in the folder, and the page shows a link to it plus the last Drive
backup time.

## How it behaves

| Situation | Result |
| --- | --- |
| All three credentials set | Button enabled; `POST /api/admin/backup/drive` returns `201` with the Drive link |
| Any credential missing | Page shows "Configure Google Drive backup" with a link to this guide; the endpoint returns `409 DRIVE_NOT_CONFIGURED`. The rest of the API boots normally |
| Refresh token expired or revoked | `502` "Google rejected the refresh token..."; generate a new one (step 4) |
| Wrong client ID or secret | `502` "Google rejected the client ID or secret..." |
| Google outage / rate limit | Retried with backoff, then `502` "Google Drive is unavailable right now" |
| `pg_dump` missing (e.g. Render) | The full JSON export is gzipped and uploaded instead (`.json.gz`) |

Every Drive backup is logged in `BackupLog` with `destination = drive`, the
filename, gzipped size, the admin's email (or `scheduled-backup`), the Drive
file id and the link.

**Unlike the local download, Drive backup is not turned off by
`DEMO_MODE=false`.** Production is exactly where an off-site copy matters, and
the dump goes only to the configured Drive, never to a browser.

## Restoring a Drive backup

Download the `.sql.gz` or `.json.gz` from Drive, then on **System & backup >
Restore** upload it as is: the server gunzips it (capped at 256 MB unpacked)
and restores it like a `.sql` / `.json`. Restore stays a local/demo feature
(`DEMO_MODE=true`); in production restore through Neon, or gunzip the `.sql.gz`
and replay it with `psql` against the Neon direct URL.

## Scheduled backups (optional)

With Drive configured **and** `BACKUP_SCHEDULE` set, the API runs a Drive backup
on that schedule (`daily` = `0 3 * * *`, server time; Render runs in UTC). An
invalid expression stops the API at boot with a clear message. If Drive is not
configured the schedule is skipped with one warning in the log.

Limits of an in-process scheduler, stated plainly: a host that sleeps when idle
(Render free tier) misses runs while asleep, and if you ever run more than one
API instance each one would back up. For that, leave `BACKUP_SCHEDULE` unset
and call the endpoint from an external scheduler instead.

## Security notes

- The client secret and refresh token are env-only secrets. They are never
  logged, never returned by the API (the System page only receives
  `configured: true/false`), and `.env` is gitignored. Drive error logs are a
  single line with status and OAuth error code; access tokens, refresh tokens
  and secrets are redacted even if a library message contained them.
- `drive.file` means the app can only see files it created. It cannot read the
  rest of that Drive, so a leaked refresh token exposes the backups, not the
  account's other documents.
- The endpoint is super-admin only (`requireAuth` + `requireSuperAdmin`).
- The backup contains bcrypt password hashes and all user data. Keep the
  Drive folder private (do not share it or create a public link).
- To revoke access: https://myaccount.google.com/permissions, remove the app,
  then delete the env vars.
- If uploads start failing after about a week, check the consent screen is in
  Production (Testing-mode refresh tokens expire after 7 days).
