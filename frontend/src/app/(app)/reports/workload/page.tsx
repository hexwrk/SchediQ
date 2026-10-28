"use client";

import { useEffect, useState } from "react";
import { ApiError, Task, TaskPriority, tasksApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CsvCell, Kv, ReportFrame, ReportTable, downloadCsv, slugDate } from "@/lib/report";

const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];

// R2: tasks grouped by subject and by priority, with counts and hours.
export default function WorkloadReport() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    tasksApi
      .list(token)
      .then((r) => setTasks(r.tasks))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, [token]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!tasks) return <p className="text-sm text-text-muted">Loading report...</p>;

  const hours = (list: Task[]) => (list.reduce((s, t) => s + t.durationMin, 0) / 60).toFixed(1);
  const bySubject = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = t.subject?.name ?? "No subject";
    bySubject.set(k, [...(bySubject.get(k) ?? []), t]);
  }
  const subjectRows: CsvCell[][] = [...bySubject.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, list]) => [
      name,
      list.length,
      ...PRIORITIES.map((p) => list.filter((t) => t.priority === p).length),
      list.filter((t) => t.status === "DONE").length,
      hours(list),
    ]);
  const priorityRows: CsvCell[][] = PRIORITIES.map((p) => {
    const list = tasks.filter((t) => t.priority === p);
    return [p.charAt(0) + p.slice(1).toLowerCase(), list.length, list.filter((t) => t.status !== "DONE").length, hours(list)];
  });
  const subjectHead = ["Subject", "Tasks", "High", "Medium", "Low", "Done", "Hours"];
  const priorityHead = ["Priority", "Tasks", "Open", "Hours"];

  return (
    <ReportFrame
      title="Workload summary"
      subtitle="All tasks grouped by subject and priority"
      onCsv={() =>
        downloadCsv(`schediq-workload-${slugDate()}.csv`, ["Group", ...subjectHead], [
          ...subjectRows.map((r) => ["By subject", ...r]),
          ...priorityRows.map((r) => ["By priority", r[0], r[1], "", "", "", r[1] as number - (r[2] as number), r[3]]),
        ])
      }
    >
      <Kv items={[["Tasks", tasks.length], ["Open", tasks.filter((t) => t.status !== "DONE").length], ["Total hours", hours(tasks)], ["Subjects", bySubject.size]]} />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">By subject</h2>
        <ReportTable head={subjectHead} rows={subjectRows} align={["l", "r", "r", "r", "r", "r", "r"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">By priority</h2>
        <ReportTable head={priorityHead} rows={priorityRows} align={["l", "r", "r", "r"]} />
      </section>
    </ReportFrame>
  );
}
