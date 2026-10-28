"use client";

import { useEffect, useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { AdminStats, AdminUser, ApiError, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CsvCell, Kv, ReportFrame, ReportTable, downloadCsv, slugDate } from "@/lib/report";

// R4 (super admin only): users by role and tier, plus system totals. The API
// returns 403 for anyone else, which renders the Access denied state.
export default function AdminReport() {
  const { token, user } = useAuth();
  const [data, setData] = useState<{ stats: AdminStats; users: AdminUser[] } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([adminApi.stats(token), adminApi.users(token)])
      .then(([stats, u]) => setData({ stats, users: u.users }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load");
      });
  }, [token]);

  if (forbidden || (user && user.role !== "SUPER_ADMIN")) return <AccessDenied />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-text-muted">Loading report...</p>;

  const { stats, users } = data;
  const roles = ["USER", "SUPER_ADMIN"] as const;
  const tiers = ["FREE", "PREMIUM"] as const;
  const matrix: CsvCell[][] = roles.map((r) => [
    r === "USER" ? "User" : "Super admin",
    ...tiers.map((t) => users.filter((u) => u.role === r && u.accountType === t).length),
    users.filter((u) => u.role === r).length,
  ]);
  const userRows: CsvCell[][] = users.map((u) => [u.name, u.email, u.role, u.accountType, u.subjectCount, u.taskCount, u.sessionCount]);
  const userHead = ["Name", "Email", "Role", "Tier", "Subjects", "Tasks", "Sessions"];

  return (
    <ReportFrame
      title="Admin system report"
      subtitle="Accounts by role and tier, and system-wide totals"
      onCsv={() => downloadCsv(`schediq-admin-${slugDate()}.csv`, userHead, userRows)}
    >
      <Kv
        items={[
          ["Users", stats.counts.users],
          ["Tasks", stats.counts.tasks],
          ["Sessions", stats.counts.sessions],
          ["Premium users", stats.usersByTier.PREMIUM ?? 0],
        ]}
      />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Users by role and tier</h2>
        <ReportTable head={["Role", "Free", "Premium", "Total"]} rows={[...matrix, ["Total", stats.usersByTier.FREE ?? 0, stats.usersByTier.PREMIUM ?? 0, stats.counts.users]]} align={["l", "r", "r", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">All accounts</h2>
        <ReportTable head={userHead} rows={userRows} align={["l", "l", "l", "l", "r", "r", "r"]} />
      </section>
      <p className="text-xs text-text-muted">
        Last backup: {stats.lastBackup ? new Date(stats.lastBackup.createdAt).toLocaleString() : "never"} · Database size{" "}
        {(stats.databaseSizeBytes / (1024 * 1024)).toFixed(1)} MB
      </p>
    </ReportFrame>
  );
}
