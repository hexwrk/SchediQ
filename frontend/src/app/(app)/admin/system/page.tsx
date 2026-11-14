"use client";

import { FormEvent, useRef, useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { CloudBackupResult, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, inputClass } from "@/lib/form";
import { DatabaseIcon } from "@/lib/icons";
import { ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";

// Super admin System page: live counts, database size, and BACKUP / RESTORE
// driven entirely from buttons (no terminal).
//
// RESTORE IS DESTRUCTIVE AND ADMIN-ONLY: it replaces the entire database with
// the uploaded file. The UI requires typing RESTORE, and the server
// independently requires confirm=RESTORE plus the SUPER_ADMIN role.
//
// In production (DEMO_MODE=false, Neon) the server reports backups as managed
// by Neon: the buttons are disabled and the reason is shown instead of an error.

const MAX_UPLOAD_MB = 50;
// Setup guide for the off-site cloud backup (S3_* env vars for R2 / B2).
// blob/HEAD follows the repo's default branch, so the link survives a
// develop -> main switch without another code change.
const CLOUD_SETUP_URL = "https://github.com/hexwrk/SchediQ/blob/HEAD/docs/CLOUD_BACKUP.md";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SystemPage() {
  const { token } = useAuth();
  const { data: stats, error: loadError, errorStatus, loading, reload, reloading } = useApi("admin-stats", adminApi.stats);
  const [error, setError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudResult, setCloudResult] = useState<CloudBackupResult | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [restoreErrors, setRestoreErrors] = useState<{ file?: string; confirm?: string }>({});
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = reload;

  async function createBackup() {
    if (!token) return;
    setBackingUp(true);
    setBackupMsg(null);
    setError(null);
    try {
      const { blob, filename, format, fallback } = await adminApi.backup(token);
      // Trigger the browser download from the in-memory blob.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupMsg(
        `Downloaded ${filename} (${formatBytes(blob.size)}, ${format === "sql" ? "pg_dump SQL" : "JSON export"})` +
          (fallback ? `. JSON fallback used: ${fallback}.` : ".")
      );
      await load();
    } catch (err) {
      setError(errorMessage(err, "Backup failed"));
    } finally {
      setBackingUp(false);
    }
  }

  // Off-site backup: the server dumps, gzips and uploads to object storage;
  // the browser only receives a short-lived presigned download link.
  async function cloudBackup() {
    if (!token) return;
    setCloudBusy(true);
    setCloudError(null);
    setCloudResult(null);
    try {
      setCloudResult(await adminApi.cloudBackup(token));
      await load();
    } catch (err) {
      setCloudError(errorMessage(err, "Cloud backup failed"));
    } finally {
      setCloudBusy(false);
    }
  }

  async function restore(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRestoreMsg(null);
    setRestoreError(null);
    const errs: { file?: string; confirm?: string } = {};
    if (!file) errs.file = "Choose a .sql or .json backup file.";
    else if (!/\.(sql|json)(\.gz)?$/i.test(file.name)) errs.file = "Only .sql, .json, .sql.gz or .json.gz SchediQ backups can be restored.";
    else if (file.size === 0) errs.file = "That file is empty.";
    else if (file.size > MAX_UPLOAD_MB * 1024 * 1024) errs.file = `Backups larger than ${MAX_UPLOAD_MB} MB are not accepted.`;
    if (confirm !== "RESTORE") errs.confirm = "Type RESTORE (in capitals) to confirm.";
    setRestoreErrors(errs);
    if (errs.file || errs.confirm || !file) return;
    // Final browser-level confirmation for an irreversible action.
    if (!window.confirm(`Replace the ENTIRE database with ${file.name}? All current data will be overwritten.`)) return;

    setRestoring(true);
    try {
      const res = await adminApi.restore(token, file);
      setRestoreMsg(`Restored from ${res.restoredFrom} (${res.format.toUpperCase()}).`);
      setFile(null);
      setConfirm("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setRestoreError(errorMessage(err, "Restore failed"));
    } finally {
      setRestoring(false);
    }
  }

  if (errorStatus === 403) return <AccessDenied />;
  if (loading) return <LoadingState label="Loading system stats" rows={2} />;
  if (!stats) return <ErrorState message={loadError ?? "Stats unavailable."} onRetry={reload} retrying={reloading} />;

  const backupOff = !stats.backup.enabled;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={stats.counts.users} />
        <Stat label="Subjects" value={stats.counts.subjects} />
        <Stat label="Tasks" value={stats.counts.tasks} />
        <Stat label="Sessions" value={stats.counts.sessions} />
        <Stat label="Completed" value={stats.counts.completedSessions} />
        <Stat label="DB size" value={formatBytes(stats.databaseSizeBytes)} />
      </div>

      {stats.backup.message && (
        <div role="status" className="flex items-start gap-2 rounded-card border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <DatabaseIcon width={18} height={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p>{stats.backup.message}</p>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <DatabaseIcon width={18} height={18} className="text-primary" />
          <h2 className="text-sm font-semibold">Off-site backup: cloud storage</h2>
        </div>
        <p className="text-sm text-text-muted">
          Uploads a gzipped full-system dump (every table; pg_dump, or the JSON export where pg_dump is not
          installed) to the configured S3-compatible bucket, so a copy exists off this server. The download link
          is valid for about an hour; the file stays in the bucket.
          {stats.cloud.scheduled && " Automatic scheduled backups are on."}
        </p>
        {stats.cloud.configured ? (
          <>
            <p className="text-sm">
              Last cloud backup:{" "}
              <span className="font-medium">
                {stats.cloud.lastBackup
                  ? `${new Date(stats.cloud.lastBackup.createdAt).toLocaleString()} (${stats.cloud.lastBackup.filename}, ${formatBytes(stats.cloud.lastBackup.sizeBytes)}, by ${stats.cloud.lastBackup.actorEmail})`
                  : "never"}
              </span>
            </p>
            <div>
              <button
                onClick={cloudBackup}
                disabled={cloudBusy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
              >
                {cloudBusy ? "Uploading to cloud storage..." : "Back up to cloud (off-site)"}
              </button>
            </div>
            {cloudResult && (
              <p role="status" className="text-sm text-accent">
                Uploaded {cloudResult.objectKey} ({formatBytes(cloudResult.sizeBytes)} gzipped from{" "}
                {formatBytes(cloudResult.rawBytes)}, {cloudResult.format === "sql" ? "pg_dump SQL" : "JSON export"})
                {cloudResult.fallbackReason ? `. JSON fallback used: ${cloudResult.fallbackReason}` : ""}.{" "}
                <a href={cloudResult.downloadUrl} rel="noopener noreferrer" className="font-medium text-primary underline">
                  Download
                </a>{" "}
                (link expires {new Date(cloudResult.downloadExpiresAt).toLocaleTimeString()}).
              </p>
            )}
            {cloudError && <p className="text-sm text-red-600">{cloudError}</p>}
          </>
        ) : (
          <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-sm">
            <p className="font-medium">Configure cloud backup</p>
            <p className="text-text-muted">
              Cloud storage is not set up on the API server yet. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID
              and S3_SECRET_ACCESS_KEY, then restart the API.
            </p>
            <a href={CLOUD_SETUP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              Open the setup guide
            </a>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <DatabaseIcon width={18} height={18} className="text-primary" />
            <h2 className="text-sm font-semibold">Create backup</h2>
          </div>
          <p className="text-sm text-text-muted">
            Produces a timestamped PostgreSQL dump (pg_dump). If pg_dump is not available on the API
            host, a full JSON export is produced instead. Either way the file downloads to this
            computer. It contains password hashes, so store it as carefully as the database itself.
          </p>
          <p className="text-sm">
            Last backup:{" "}
            <span className="font-medium">
              {stats.lastBackup
                ? `${new Date(stats.lastBackup.createdAt).toLocaleString()} (${stats.lastBackup.format.toUpperCase()}, ${formatBytes(stats.lastBackup.sizeBytes)}, by ${stats.lastBackup.actorEmail})`
                : "never"}
            </span>
          </p>
          <div>
            <button
              onClick={createBackup}
              disabled={backingUp || backupOff}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
            >
              {backingUp ? "Creating backup..." : "Create backup"}
            </button>
          </div>
          {backupMsg && <p className="text-sm text-accent">{backupMsg}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>

        <form
          onSubmit={restore}
          noValidate
          className="flex flex-col gap-3 rounded-card border border-red-200 bg-surface p-5"
        >
          <h2 className="text-sm font-semibold text-red-600">Restore from backup (destructive)</h2>
          <p className="text-sm text-text-muted">
            Replaces <span className="font-medium text-text">all</span> data with the uploaded backup.
            Everything created since that backup is lost. Runs in a single transaction, so a bad file
            changes nothing.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Backup file (.sql, .json, or .gz from the cloud bucket)
            <input
              ref={fileRef}
              type="file"
              accept=".sql,.json,.gz"
              disabled={backupOff}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-bg file:px-3 file:py-1.5 file:text-sm"
            />
            <FieldError message={restoreErrors.file} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Type RESTORE to confirm
            <input
              value={confirm}
              disabled={backupOff}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!restoreErrors.confirm}
              className={inputClass(restoreErrors.confirm)}
            />
            <FieldError message={restoreErrors.confirm} />
          </label>
          <div>
            <button
              type="submit"
              disabled={restoring || backupOff}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
            >
              {restoring ? "Restoring..." : "Restore database"}
            </button>
          </div>
          {stats.lastRestore && (
            <p className="text-xs text-text-muted">
              Last restore: {new Date(stats.lastRestore.createdAt).toLocaleString()} from {stats.lastRestore.filename}
            </p>
          )}
          {restoreMsg && <p className="text-sm text-accent">{restoreMsg}</p>}
          {restoreError && <p className="text-sm text-red-600">{restoreError}</p>}
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
