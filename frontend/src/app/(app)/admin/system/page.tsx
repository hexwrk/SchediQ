"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { AdminStats, ApiError, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, inputClass } from "@/lib/form";
import { DatabaseIcon } from "@/lib/icons";

// Super admin System page: live counts, database size, and BACKUP / RESTORE
// driven entirely from buttons (no terminal).
//
// RESTORE IS DESTRUCTIVE AND ADMIN-ONLY: it replaces the entire database with
// the uploaded file. The UI requires typing RESTORE, and the server
// independently requires confirm=RESTORE plus the SUPER_ADMIN role.

const MAX_UPLOAD_MB = 50;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SystemPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [restoreErrors, setRestoreErrors] = useState<{ file?: string; confirm?: string }>({});
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStats(await adminApi.stats(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof ApiError ? err.message : "Failed to load stats");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
      setError(err instanceof ApiError ? err.message : "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  async function restore(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRestoreMsg(null);
    setRestoreError(null);
    const errs: { file?: string; confirm?: string } = {};
    if (!file) errs.file = "Choose a .sql or .json backup file.";
    else if (!/\.(sql|json)$/i.test(file.name)) errs.file = "Only .sql or .json SchediQ backups can be restored.";
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
      setRestoreError(err instanceof ApiError ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  if (forbidden) return <AccessDenied />;
  if (error && !stats) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-text-muted">Loading system stats...</p>;

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
              disabled={backingUp}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
            Backup file (.sql or .json)
            <input
              ref={fileRef}
              type="file"
              accept=".sql,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-bg file:px-3 file:py-1.5 file:text-sm"
            />
            <FieldError message={restoreErrors.file} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Type RESTORE to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!restoreErrors.confirm}
              className={inputClass(restoreErrors.confirm)}
            />
            <FieldError message={restoreErrors.confirm} />
          </label>
          <div>
            <button
              type="submit"
              disabled={restoring}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
