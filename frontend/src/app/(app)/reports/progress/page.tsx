"use client";

import { useState } from "react";
import { progressApi, sessionsApi, tasksApi } from "@/lib/api";
import { BarChart, DonutChart } from "@/lib/charts";
import { inDateRange, toDateInput } from "@/lib/dates";
import { ChartCard, CsvCell, Kv, Range, ReportFrame, ReportTable, downloadCsv, slugDate } from "@/lib/report";
import { ErrorState, LoadingState } from "@/lib/states";
import { useApi } from "@/lib/use-api";

async function loadProgress(token: string) {
  const [progress, overview, tasks, schedule] = await Promise.all([
    progressApi.get(token),
    progressApi.overview(token),
    tasksApi.list(token),
    sessionsApi.list(token),
  ]);
  return { progress, overview, tasks: tasks.tasks, sessions: schedule.sessions };
}

// R3: XP, study time, completion and mastery. The range filters the activity
// figures (XP earned, study time); totals like level and mastery are "as of now".
export default function ProgressReport() {
  const { data, error, loading, reload, reloading } = useApi("report-progress", loadProgress);
  const [range, setRange] = useState<Range>(() => {
    const today = new Date();
    return { from: toDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: toDateInput(today) };
  });

  if (loading) return <LoadingState label="Loading report" />;
  if (!data) return <ErrorState message={error ?? "Report unavailable."} onRetry={reload} retrying={reloading} />;

  const { progress, overview, tasks, sessions } = data;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const rate = tasks.length ? Math.round((100 * done) / tasks.length) : 0;

  const xpDays = progress.xpByDay.filter((d) => inDateRange(`${d.date}T12:00:00`, range.from, range.to));
  const xpInRange = xpDays.reduce((s, d) => s + d.xp, 0);
  const completed = sessions.filter((s) => s.completedAt && inDateRange(s.completedAt, range.from, range.to));
  const studyMin = completed.reduce(
    (s, x) => s + Math.round((new Date(x.endsAt).getTime() - new Date(x.startsAt).getTime()) / 60000),
    0
  );

  const subjectRows: CsvCell[][] = overview.mastery.map((m) => {
    const list = tasks.filter((t) => t.subjectId === m.subjectId);
    const d = list.filter((t) => t.status === "DONE").length;
    return [
      m.name,
      list.length,
      d,
      list.length ? `${Math.round((100 * d) / list.length)}%` : "-",
      `${m.mastery}%`,
      m.changeThisWeek > 0 ? `+${m.changeThisWeek}` : m.changeThisWeek,
    ];
  });
  const xpRows: CsvCell[][] = progress.xpRules.sources.map((s) => [s.label, s.amount, progress.breakdown[s.source]]);
  const subjectHead = ["Subject", "Tasks", "Done", "Completion", "Mastery", "Change (week)"];

  return (
    <ReportFrame
      title="Progress report"
      subtitle="Experience points, study time, completion and subject mastery"
      range={range}
      onRange={setRange}
      rangeHint="Filters XP earned and study time. Level, streak and mastery are as of today."
      onCsv={() =>
        downloadCsv(`schediq-progress-${slugDate()}.csv`, ["Section", "Item", "Value 1", "Value 2", "Value 3", "Value 4", "Value 5"], [
          ["Period", "From", range.from || "all"],
          ["Period", "To", range.to || "all"],
          ["Summary", "XP earned in period", xpInRange],
          ["Summary", "Study hours in period", (studyMin / 60).toFixed(1)],
          ["Summary", "Task completion rate", `${rate}%`],
          ["Summary", "Total XP", progress.xp],
          ["Summary", "Level", `${progress.level} (${progress.levelTitle})`],
          ["Summary", "Current streak (days)", progress.streak],
          ...xpDays.map((d) => ["XP per day", d.date, d.xp]),
          ...subjectRows.map((r) => ["Subject", ...r]),
          ...xpRows.map((r) => ["XP source (all time)", ...r]),
        ])
      }
    >
      <Kv
        items={[
          ["XP in period", xpInRange],
          ["Study hours in period", (studyMin / 60).toFixed(1)],
          ["Task completion", `${rate}%`],
          ["Level / streak", `${progress.level} · ${progress.streak}d`],
        ]}
      />
      <ChartCard title="XP earned per day">
        <BarChart data={xpDays.map((d) => ({ label: d.date.slice(5), value: d.xp }))} unit="XP" ariaLabel="XP earned per day" />
      </ChartCard>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
        <ChartCard title="Mastery by subject">
          <BarChart
            data={overview.mastery.map((m) => ({ label: m.name, value: m.mastery, color: m.colorTag }))}
            unit="% mastery"
            ariaLabel="Mastery percentage by subject"
          />
        </ChartCard>
        <ChartCard title="XP by source (all time)">
          <DonutChart
            data={progress.xpRules.sources.map((s) => ({ label: s.label, value: progress.breakdown[s.source] }))}
            ariaLabel="XP by source"
          />
        </ChartCard>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Per-subject completion and mastery</h2>
        <ReportTable head={subjectHead} rows={subjectRows} align={["l", "r", "r", "r", "r", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Badges</h2>
        <p className="text-sm">{progress.badges.filter((b) => b.unlocked).map((b) => b.label).join(", ") || "None yet"}</p>
      </section>
    </ReportFrame>
  );
}
