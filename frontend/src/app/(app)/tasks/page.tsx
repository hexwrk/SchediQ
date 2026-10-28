"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  Subject,
  Task,
  TaskPriority,
  TaskStatus,
  subjectsApi,
  tasksApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PlusIcon } from "@/lib/icons";
import { NUMBER_LIMITS } from "@shared/validation";
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

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  HIGH: "var(--amber)",
  MEDIUM: "var(--primary)",
  LOW: "var(--text-muted)",
};

export default function TasksPage() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!token) return;
    Promise.all([tasksApi.list(token), subjectsApi.list(token)])
      .then(([t, s]) => {
        setTasks(t.tasks);
        setSubjects(s.subjects);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  function startEdit(task: Task) {
    setEditingId(task.id);
    setFieldErrors({});
    setForm({
      title: task.title,
      deadline: task.deadline.slice(0, 16),
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
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setEditingId(null);
    } catch (err) {
      const fromServer = serverFieldErrors(err, TASK_FIELDS);
      setFieldErrors(fromServer);
      if (!hasErrors(fromServer)) setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function toggleDone(task: Task) {
    if (!token) return;
    const status: TaskStatus = task.status === "DONE" ? "PENDING" : "DONE";
    try {
      const { task: updated } = await tasksApi.update(token, task.id, { status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    }
  }

  async function remove(id: string) {
    if (!token) return;
    try {
      await tasksApi.remove(token, id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Everything on your plate.</p>
        <Link
          href="/add-task"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <PlusIcon width={16} height={16} />
          Add task
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-muted">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-text-muted">No tasks yet.</p>
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
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))
                      }
                      className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
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
                      className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
                    >
                      <option value="">None</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
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
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "DONE"}
                    onChange={() => toggleDone(task)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <div>
                    <p
                      className={`font-medium ${
                        task.status === "DONE" ? "text-text-muted line-through" : ""
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{new Date(task.deadline).toLocaleDateString()}</span>
                      <span>·</span>
                      <span>{task.durationMin}min</span>
                      <span>·</span>
                      <span style={{ color: PRIORITY_COLOR[task.priority] }}>
                        {task.priority}
                      </span>
                      {task.subject && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: task.subject.colorTag }}
                            />
                            {task.subject.name}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => startEdit(task)} className="text-primary hover:underline">
                    Edit
                  </button>
                  <button onClick={() => remove(task.id)} className="text-red-600 hover:underline">
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
