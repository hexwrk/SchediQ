# Cloud backup (S3-compatible): setup (~5 min)

Off-site backup for SchediQ. The admin **System & backup** page has a **Back up
to cloud (off-site)** button that dumps the whole database (`pg_dump`, or the
JSON export where `pg_dump` is not installed), gzips it and uploads it to a
bucket under `backups/`. It works with any S3-compatible provider: Cloudflare
R2, Backblaze B2, AWS S3 or MinIO. No OAuth, just five env vars. The local
**Create backup** download still works as before for local dev.

## Env vars

All five must be set, or cloud backup is off. Set them in `backend/.env`
locally and in Render for production. Never commit real values.

```
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# optional automatic backup: "daily" (03:00 server time) or a cron expression
BACKUP_SCHEDULE=daily
```

### Cloudflare R2

1. R2 > Create bucket, e.g. `schediq-backups`.
2. R2 > Manage API tokens > Create API token: permission **Object Read &
   Write**, scoped to that one bucket. Copy the Access Key ID and Secret.

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=schediq-backups
S3_ACCESS_KEY_ID=<access key id>
S3_SECRET_ACCESS_KEY=<secret access key>
```

### Backblaze B2

1. Buckets > Create a Bucket: **Private**. Note the endpoint shown on the
   bucket, e.g. `s3.us-west-004.backblazeb2.com`.
2. Application Keys > Add a New Application Key: restricted to that bucket,
   Read and Write. Copy the keyID and applicationKey (shown once).

```
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
S3_REGION=us-west-004
S3_BUCKET=schediq-backups
S3_ACCESS_KEY_ID=<keyID>
S3_SECRET_ACCESS_KEY=<applicationKey>
```

The region is the middle part of the endpoint host. Use your bucket's values.

Restart the API, open **System & backup** and click **Back up to cloud
(off-site)**. An object like `backups/schediq-backup-2026-11-02T09-23-39Z.sql.gz`
appears in the bucket, and the page shows a download link (valid ~1 hour) and
the last cloud backup time.

## How it behaves

| Situation | Result |
| --- | --- |
| All five set | `POST /api/admin/backup/cloud` returns `201` with `objectKey` and a presigned `downloadUrl` (1 hour) |
| Any missing | Page shows "Configure cloud backup" linking here; endpoint returns `409 STORAGE_NOT_CONFIGURED`; the rest of the API boots normally |
| Wrong key / secret | `502` "The storage provider rejected the access key..." |
| Bucket missing | `502` "The bucket does not exist..." |
| Key lacks write | `502` "...refused the upload (403)..." |
| `pg_dump` missing (e.g. Render) | The full JSON export is uploaded instead (`.json.gz`) |

Every upload is logged in `BackupLog` with `destination = s3`, the object key,
filename, gzipped size and the admin's email (or `scheduled-backup`). The
presigned URL is never stored or logged. Cloud backup is not turned off by
`DEMO_MODE=false`: production is where an off-site copy matters.

## Restoring

Download the `.sql.gz` / `.json.gz` (from the page link or the provider's
console) and upload it as is on **System & backup > Restore**. The server
gunzips it (capped at 256 MB unpacked) and restores it. Restore is a
local/demo feature (`DEMO_MODE=true`); in production, `gunzip` the `.sql.gz`
and replay it with `psql` against the Neon direct URL.

## Scheduled backups

With storage configured **and** `BACKUP_SCHEDULE` set, the API uploads on that
schedule (Render runs in UTC). An invalid expression stops the API at boot.
The scheduler is in-process: a sleeping host (Render free tier) skips runs, and
multiple instances would each back up. At that point unset `BACKUP_SCHEDULE`
and call the endpoint from an external scheduler.

## Security notes

- Keys are env-only: never logged, never returned (the UI only gets a
  `configured` flag). Storage errors log one line with status and error name;
  signatures, access key IDs and the secret are redacted.
- Scope the key to the one backup bucket and keep the bucket private. Dumps
  contain bcrypt hashes and all user data.
- Set a lifecycle rule on `backups/` (e.g. delete after 30 days) to cap cost
  and retention.
- The endpoint is super-admin only (`requireAuth` + `requireSuperAdmin`).
