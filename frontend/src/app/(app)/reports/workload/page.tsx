"use client";

import { useState } from "react";
import { Task, TaskPriority, tasksApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BarChart, DonutChart } from "@/lib/charts";
import { inDateRange } from "@/lib/dates";
import { downloadReportPdf } from "@/lib/pdf";
import { ChartCard, CsvCell, Kv, Range, ReportFrame, ReportTable, downloadCsv, rangeLabel, slugDate } from "@/lib/report";
import { ErrorState, LoadingState } from "@/lib/states";
import { useApi } from "@/lib/use-api";

const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_COLOR: Record<TaskPriority, string> = { HIGH: "#D98324", MEDIUM: "#3454D1", LOW: "#64748B" };
const title = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();

// R2: tasks grouped by subject and by priority, filtered by deadline.
export default function WorkloadReport() {
  const { user } = useAuth();
  const { data, error, loading, reload, reloading } = useApi("report-workload", (t) => tasksApi.list(t).then((r) => r.tasks));
  const [range, setRange] = useState<Range>({ from: "", to: "" });

  if (loading) return <LoadingState label="Loading report" />;
  if (!data) return <ErrorState message={error ?? "Report unavailable."} onRetry={reload} retrying={reloading} />;

  const tasks = data.filter((t) => inDateRange(t.deadline, range.from, range.to));
  const hours = (list: Task[]) => Number((list.reduce((s, t) => s + t.durationMin, 0) / 60).toFixed(1));

  const bySubject = new Map<string, { color: string; list: Task[] }>();
  for (const t of tasks) {
    const k = t.subject?.name ?? "No subject";
    const entry = bySubject.get(k) ?? { color: t.subject?.colorTag ?? "#64748B", list: [] };
    entry.list.push(t);
    bySubject.set(k, entry);
  }
  const subjects = [...bySubject.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const subjectRows: CsvCell[][] = subjects.map(([name, { list }]) => [
    name,
    list.length,
    ...PRIORITIES.map((p) => list.filter((t) => t.priority === p).length),
    list.filter((t) => t.status === "DONE").length,
    hours(list),
  ]);
  const priorityRows: CsvCell[][] = PRIORITIES.map((p) => {
    const list = tasks.filter((t) => t.priority === p);
    return [title(p), list.length, list.filter((t) => t.status !== "DONE").length, hours(list)];
  });
  const subjectHead = ["Subject", "Tasks", "High", "Medium", "Low", "Done", "Hours"];
  const priorityHead = ["Priority", "Tasks", "Open", "Hours"];
  const summary: [string, string | number][] = [
    ["Tasks", tasks.length],
    ["Open", tasks.filter((t) => t.status !== "DONE").length],
    ["Total hours", hours(tasks)],
    ["Subjects", bySubject.size],
  ];
  const hoursBySubject = subjects.map(([label, { color, list }]) => ({ label, value: hours(list), color }));
  const tasksByPriority = PRIORITIES.map((p) => ({ label: title(p), value: tasks.filter((t) => t.priority === p).length, color: PRIORITY_COLOR[p] }));

  return (
    <ReportFrame
      title="Workload summary"
      subtitle="Tasks grouped by subject and priority"
      range={range}
      onRange={setRange}
      rangeHint="Filters by task deadline."
      onCsv={() =>
        downloadCsv(`schediq-workload-${slugDate()}.csv`, ["Group", ...subjectHead], [
          ...subjectRows.map((r) => ["By subject", ...r]),
          ...priorityRows.map((r) => ["By priority", r[0], r[1], "", "", "", (r[1] as number) - (r[2] as number), r[3]]),
        ])
      }
      onPdf={() =>
        downloadReportPdf({
          filename: `schediq-workload-${slugDate()}.pdf`,
          title: "Workload summary",
          subtitle: "Tasks grouped by subject and priority",
          user,
          period: rangeLabel(range),
          summary,
          charts: [
            { title: "Hours by subject", data: hoursBySubject, unit: "hours" },
            { title: "Tasks by priority", data: tasksByPriority, unit: "tasks" },
          ],
          tables: [
            { title: "By subject", head: subjectHead, rows: subjectRows, align: ["l", "r", "r", "r", "r", "r", "r"] },
            { title: "By priority", head: priorityHead, rows: priorityRows, align: ["l", "r", "r", "r"] },
          ],
        })
      }
    >
      <Kv items={summary} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr] print:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Hours by subject">
          <BarChart
            data={hoursBySubject}
            unit="hours"
            ariaLabel="Hours of work by subject"
          />
        </ChartCard>
        <ChartCard title="Tasks by priority">
          <DonutChart
            data={tasksByPriority}
            ariaLabel="Tasks by priority"
          />
        </ChartCard>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-text-muted">No tasks with a deadline in this period.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">By subject</h2>
            <ReportTable head={subjectHead} rows={subjectRows} align={["l", "r", "r", "r", "r", "r", "r"]} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">By priority</h2>
            <ReportTable head={priorityHead} rows={priorityRows} align={["l", "r", "r", "r"]} />
          </section>
        </>
      )}
    </ReportFrame>
  );
}
