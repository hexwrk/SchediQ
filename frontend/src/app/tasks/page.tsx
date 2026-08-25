"use client";

import { useRouter } from "next/navigation";
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

const emptyForm = {
  title: "",
  deadline: "",
  durationMin: 60,
  priority: "MEDIUM" as TaskPriority,
  subjectId: "",
};

export default function TasksPage() {
  const { token, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    Promise.all([tasksApi.list(token), subjectsApi.list(token)])
      .then(([taskRes, subjectRes]) => {
        setTasks(taskRes.tasks);
        setSubjects(subjectRes.subjects);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);

    const payload = {
      title: form.title,
      deadline: new Date(form.deadline).toISOString(),
      durationMin: Number(form.durationMin),
      priority: form.priority,
      subjectId: form.subjectId || null,
    };

    try {
      if (editingId) {
        const { task } = await tasksApi.update(token, editingId, payload);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      } else {
        const { task } = await tasksApi.create(token, payload);
        setTasks((prev) => [...prev, task]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save task");
    }
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      deadline: task.deadline.slice(0, 16),
      durationMin: task.durationMin,
      priority: task.priority,
      subjectId: task.subjectId ?? "",
    });
  }

  async function onDelete(id: string) {
    if (!token) return;
    try {
      await tasksApi.remove(token, id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete task");
    }
  }

  async function onToggleDone(task: Task) {
    if (!token) return;
    const status: TaskStatus = task.status === "DONE" ? "PENDING" : "DONE";
    try {
      const { task: updated } = await tasksApi.update(token, task.id, { status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    }
  }

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-zinc-500">{user.email}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium text-zinc-500">
          {editingId ? "Edit task" : "New task"}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Deadline
            <input
              type="datetime-local"
              required
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              className="rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Duration (minutes)
            <input
              type="number"
              min={5}
              required
              value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
              className="rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Priority
            <select
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))
              }
              className="rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Subject
            <select
              value={form.subjectId}
              onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
              className="rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
          >
            {editingId ? "Save changes" : "Add task"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-black/10 px-5 py-2 text-sm font-medium dark:border-white/15"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={task.status === "DONE"}
                  onChange={() => onToggleDone(task)}
                />
                <div>
                  <p className={task.status === "DONE" ? "line-through text-zinc-400" : ""}>
                    {task.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(task.deadline).toLocaleString()} · {task.durationMin}min ·{" "}
                    {task.priority}
                    {task.subject ? ` · ${task.subject.name}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <button onClick={() => startEdit(task)} className="underline">
                  Edit
                </button>
                <button onClick={() => onDelete(task.id)} className="text-red-600 underline">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
