"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { NUMBER_LIMITS } from "@shared/validation";
import { Subject, Task, TaskPriority, TaskStatus, subjectsApi, tasksApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toLocalInput } from "@/lib/dates";
import {
  FieldError,
  FieldErrors,
  TASK_FIELDS,
  TaskField,
  hasErrors,
  inputClass,
  serverFieldErrors,
  validateTaskForm,
} from "@/lib/form";
import { PlusIcon } from "@/lib/icons";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { TaskProgressLine, useXpReward } from "@/lib/ui";
import { errorMessage, useApi } from "@/lib/use-api";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  HIGH: "var(--amber)",
  MEDIUM: "var(--primary)",
  LOW: "var(--text-muted)",
};

async function loadTasks(token: string): Promise<{ tasks: Task[]; subjects: Subject[] }> {
  const [t, s] = await Promise.all([tasksApi.list(token), subjectsApi.list(token)]);
  return { tasks: t.tasks, subjects: s.subjects };
}

export default function TasksPage() {
  const { token } = useAuth();
  const { data, error, loading, reload, reloading, mutate } = useApi("tasks", loadTasks);
  const { reward, float } = useXpReward();
  const [actionError, setActionError] = useState<string | null>(null);

  // Inline edit state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    deadline: "",
    // Raw input string so blanks/negatives get a message instead of NaN.
    durationMin: "60",
    priority: "MEDIUM" as TaskPriority,
    subjectId: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TaskField>>({});

  const replace = (task: Task) =>
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) }));

  function startEdit(task: Task) {
    setEditingId(task.id);
    setFieldErrors({});
    setForm({
      title: task.title,
      deadline: toLocalInput(task.deadline),
      durationMin: String(task.durationMin),
      priority: task.priority,
      subjectId: task.subjectId ?? "",
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editingId) return;
    const found = validateTaskForm(form);
    setFieldErrors(found);
    if (hasErrors(found)) return;
    try {
      const { task } = await tasksApi.update(token, editingId, {
        title: form.title.trim(),
        deadline: new Date(form.deadline).toISOString(),
        durationMin: Number(form.durationMin),
        priority: form.priority,
        subjectId: form.subjectId || null,
      });
      replace(task);
      setEditingId(null);
    } catch (err) {
      const fromServer = serverFieldErrors(err, TASK_FIELDS);
      setFieldErrors(fromServer);
      if (!hasErrors(fromServer)) setActionError(errorMessage(err, "Failed to save"));
    }
  }

  // Ticking a lesson-linked task also completes its lesson server-side, which
  // can earn XP, so it goes through reward() to show the gain.
  async function toggleDone(task: Task) {
    if (!token) return;
    const status: TaskStatus = task.status === "DONE" ? "PENDING" : "DONE";
    setActionError(null);
    try {
      await reward(async () => {
        const { task: updated } = await tasksApi.update(token, task.id, { status });
        replace(updated);
      });
    } catch (err) {
      setActionError(errorMessage(err, "Failed to update"));
    }
  }

  async function remove(task: Task) {
    if (!token || !window.confirm(`Delete "${task.title}" and its study blocks?`)) return;
    try {
      await tasksApi.remove(token, task.id);
      mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) }));
    } catch (err) {
      setActionError(errorMessage(err, "Failed to delete"));
    }
  }

  const tasks = data?.tasks ?? [];
  const subjects = data?.subjects ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {float}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">Everything on your plate.</p>
        <Link
          href="/add-task"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90"
        >
          <PlusIcon width={16} height={16} />
          Add task
        </Link>
      </div>

      {actionError && <ErrorState title="That didn't work" message={actionError} />}

      {loading ? (
        <LoadingState label="Loading tasks" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} retrying={reloading} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          body="Describe a piece of work in plain English (e.g. 'Revise SQL joins for 2 hours, due Friday') and SchediQ fills in the details and schedules it."
          actionHref="/add-task"
          actionLabel="Add your first task"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) =>
            editingId === task.id ? (
              <form
                key={task.id}
                onSubmit={saveEdit}
                noValidate
                className="flex flex-col gap-3 rounded-card border border-primary/40 bg-surface p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Title
                    <input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      aria-invalid={!!fieldErrors.title}
                      className={inputClass(fieldErrors.title)}
                    />
                    <FieldError message={fieldErrors.title} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Deadline
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                      aria-invalid={!!fieldErrors.deadline}
                      className={inputClass(fieldErrors.deadline)}
                    />
                    <FieldError message={fieldErrors.deadline} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Duration (min)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={NUMBER_LIMITS.durationMin.min}
                      max={NUMBER_LIMITS.durationMin.max}
                      value={form.durationMin}
                      onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                      aria-invalid={!!fieldErrors.durationMin}
                      className={inputClass(fieldErrors.durationMin)}
                    />
                    <FieldError message={fieldErrors.durationMin} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Priority
                    <select
                      value={form.priority}
                      onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                      className={inputClass(null)}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Subject
                    <select
                      value={form.subjectId}
                      onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
                      className={inputClass(fieldErrors.subjectId)}
                    >
                      <option value="">None</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <FieldError message={fieldErrors.subjectId} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={task.id}
                className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "DONE"}
                    onChange={() => toggleDone(task)}
                    aria-label={`Mark ${task.title} ${task.status === "DONE" ? "not done" : "done"}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${task.status === "DONE" ? "text-text-muted line-through" : ""}`}>
                      {task.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                      <span>{new Date(task.deadline).toLocaleDateString()}</span>
                      <span>·</span>
                      <span>{task.durationMin}min</span>
                      <span>·</span>
                      <span style={{ color: PRIORITY_COLOR[task.priority] }}>{task.priority}</span>
                      {task.subject && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ background: task.subject.colorTag }} />
                            {task.subject.name}
                          </span>
                        </>
                      )}
                      {task.lessonId && (
                        <>
                          <span>·</span>
                          <span className="text-primary">course lesson</span>
                        </>
                      )}
                      {task.status === "IN_PROGRESS" && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-primary">in progress</span>
                        </>
                      )}
                    </p>
                    <div className="mt-2 max-w-md">
                      <TaskProgressLine task={task} />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button onClick={() => startEdit(task)} className="text-primary hover:underline">
                    Edit
                  </button>
                  <button onClick={() => remove(task)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
