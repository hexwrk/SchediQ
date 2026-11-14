"use client";

import { useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BarChart, DonutChart } from "@/lib/charts";
import { inDateRange } from "@/lib/dates";
import { ChartCard, CsvCell, Kv, Range, ReportFrame, ReportTable, downloadCsv, slugDate } from "@/lib/report";
import { ErrorState, LoadingState } from "@/lib/states";
import { useApi } from "@/lib/use-api";

async function loadAdmin(token: string) {
  const [stats, users] = await Promise.all([adminApi.stats(token), adminApi.users(token)]);
  return { stats, users: users.users };
}

// R4 (super admin only): real counts straight from the database. The API
// returns 403 for anyone else, which renders the Access denied state.
export default function AdminReport() {
  const { user } = useAuth();
  const { data, error, errorStatus, loading, reload, reloading } = useApi("report-admin", loadAdmin);
  const [range, setRange] = useState<Range>({ from: "", to: "" });

  if (errorStatus === 403 || (user && user.role !== "SUPER_ADMIN")) return <AccessDenied />;
  if (loading) return <LoadingState label="Loading report" />;
  if (!data) return <ErrorState message={error ?? "Report unavailable."} onRetry={reload} retrying={reloading} />;

  const { stats } = data;
  // The range filters accounts by sign-up date; system totals stay global.
  const users = data.users.filter((u) => inDateRange(u.createdAt, range.from, range.to));
  const count = (role: string, tier?: string) =>
    users.filter((u) => u.role === role && (tier === undefined || u.accountType === tier)).length;
  const matrix: CsvCell[][] = [
    ["User", count("USER", "FREE"), count("USER", "PREMIUM"), count("USER")],
    ["Super admin", count("SUPER_ADMIN", "FREE"), count("SUPER_ADMIN", "PREMIUM"), count("SUPER_ADMIN")],
    ["Total", users.filter((u) => u.accountType === "FREE").length, users.filter((u) => u.accountType === "PREMIUM").length, users.length],
  ];
  const userRows: CsvCell[][] = users.map((u) => [
    u.name,
    u.email,
    u.role,
    u.accountType,
    new Date(u.createdAt).toLocaleDateString(),
    u.subjectCount,
    u.taskCount,
    u.sessionCount,
  ]);
  const userHead = ["Name", "Email", "Role", "Tier", "Joined", "Subjects", "Tasks", "Sessions"];
  const topByTasks = [...users].sort((a, b) => b.taskCount - a.taskCount).slice(0, 8);

  return (
    <ReportFrame
      title="Admin system report"
      subtitle="Accounts by role and tier, and live system totals"
      range={range}
      onRange={setRange}
      rangeHint="Filters accounts by sign-up date. System totals are always global."
      onCsv={() => downloadCsv(`schediq-admin-${slugDate()}.csv`, userHead, userRows)}
    >
      <Kv
        items={[
          ["Accounts (all)", stats.counts.users],
          ["Tasks (all)", stats.counts.tasks],
          ["Sessions (all)", `${stats.counts.completedSessions}/${stats.counts.sessions} done`],
          ["Premium (all)", stats.usersByTier.PREMIUM ?? 0],
        ]}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
        <ChartCard title="Accounts by tier">
          <DonutChart
            data={[
              { label: "Free", value: users.filter((u) => u.accountType === "FREE").length, color: "#64748B" },
              { label: "Premium", value: users.filter((u) => u.accountType === "PREMIUM").length, color: "#6B52E0" },
            ]}
            ariaLabel="Accounts by tier"
          />
        </ChartCard>
        <ChartCard title="Most active accounts (tasks)">
          <BarChart data={topByTasks.map((u) => ({ label: u.name, value: u.taskCount }))} unit="tasks" ariaLabel="Tasks per account" />
        </ChartCard>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Accounts by role and tier</h2>
        <ReportTable head={["Role", "Free", "Premium", "Total"]} rows={matrix} align={["l", "r", "r", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Accounts ({users.length})</h2>
        <ReportTable head={userHead} rows={userRows} align={["l", "l", "l", "l", "l", "r", "r", "r"]} />
      </section>
      <p className="text-xs text-text-muted">
        Database size {(stats.databaseSizeBytes / (1024 * 1024)).toFixed(1)} MB · Last backup{" "}
        {stats.lastBackup ? new Date(stats.lastBackup.createdAt).toLocaleString() : "never"}
      </p>
    </ReportFrame>
  );
}
