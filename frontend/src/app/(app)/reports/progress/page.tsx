"use client";

import { useEffect, useState } from "react";
import { ApiError, Overview, Progress, Task, progressApi, tasksApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CsvCell, Kv, ReportFrame, ReportTable, downloadCsv, slugDate } from "@/lib/report";

// R3: completion rate, XP, streak, and per-subject completion + mastery.
export default function ProgressReport() {
  const { token } = useAuth();
  const [data, setData] = useState<{ progress: Progress; overview: Overview; tasks: Task[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([progressApi.get(token), progressApi.overview(token), tasksApi.list(token)])
      .then(([progress, overview, t]) => setData({ progress, overview, tasks: t.tasks }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, [token]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-text-muted">Loading report...</p>;

  const { progress, overview, tasks } = data;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const rate = tasks.length ? Math.round((100 * done) / tasks.length) : 0;

  const subjectRows: CsvCell[][] = overview.mastery.map((m) => {
    const list = tasks.filter((t) => t.subjectId === m.subjectId);
    const d = list.filter((t) => t.status === "DONE").length;
    return [m.name, list.length, d, list.length ? `${Math.round((100 * d) / list.length)}%` : "-", `${m.mastery}%`, m.changeThisWeek > 0 ? `+${m.changeThisWeek}` : m.changeThisWeek];
  });
  const xpRows: CsvCell[][] = progress.xpRules.sources.map((s) => [s.label, s.amount, progress.breakdown[s.source]]);
  const subjectHead = ["Subject", "Tasks", "Done", "Completion", "Mastery", "Mastery change (week)"];

  return (
    <ReportFrame
      title="Progress report"
      subtitle="Completion, experience points, streak and subject mastery"
      onCsv={() =>
        downloadCsv(`schediq-progress-${slugDate()}.csv`, ["Section", "Item", "Value 1", "Value 2", "Value 3", "Value 4", "Value 5"], [
          ["Summary", "Task completion rate", `${rate}%`],
          ["Summary", "Total XP", progress.xp],
          ["Summary", "Level", `${progress.level} (${progress.levelTitle})`],
          ["Summary", "Current streak (days)", progress.streak],
          ["Summary", "Badges unlocked", progress.badges.filter((b) => b.unlocked).length],
          ...subjectRows.map((r) => ["Subject", ...r]),
          ...xpRows.map((r) => ["XP source", ...r]),
        ])
      }
    >
      <Kv
        items={[
          ["Completion rate", `${rate}%`],
          ["Total XP", progress.xp],
          ["Level", `${progress.level} · ${progress.levelTitle}`],
          ["Streak", `${progress.streak} days`],
        ]}
      />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Per-subject completion and mastery</h2>
        <ReportTable head={subjectHead} rows={subjectRows} align={["l", "r", "r", "r", "r", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">XP by source</h2>
        <ReportTable head={["Source", "Rule", "XP earned"]} rows={[...xpRows, ["Total", "", progress.xp]]} align={["l", "l", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Badges</h2>
        <p className="text-sm">
          {progress.badges.filter((b) => b.unlocked).map((b) => b.label).join(", ") || "None yet"}
        </p>
      </section>
    </ReportFrame>
  );
}
