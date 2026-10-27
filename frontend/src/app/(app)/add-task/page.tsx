"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  CognitiveCategory,
  ParsedTask,
  Subject,
  TaskPriority,
  aiApi,
  subjectsApi,
  tasksApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { SparkIcon } from "@/lib/icons";

const CATEGORIES: CognitiveCategory[] = ["Analytical", "Verbal", "Technical", "General"];

// Convert an ISO string to the value a datetime-local input expects (local
// time, no timezone suffix). Returns "" for null.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AddTaskPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<ParsedTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable task fields (prefilled by the parser, overridable by the user).
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [subjectId, setSubjectId] = useState("");

  // New-subject confirmation state (shown when the parser flags isNewSubject).
  const [pendingSubjectName, setPendingSubjectName] = useState("");
  const [pendingCategory, setPendingCategory] = useState<CognitiveCategory>("General");

  useEffect(() => {
    if (!token) return;
    subjectsApi.list(token).then((r) => setSubjects(r.subjects)).catch(() => {});
  }, [token]);

  async function onParse() {
    if (!token || !text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const parsed = await aiApi.parse(token, text);
      setParseInfo(parsed);
      setTitle(parsed.title);
      setDeadline(toLocalInput(parsed.deadline));
      setDurationMin(parsed.durationMin);
      setPriority(parsed.priority);
      setSubjectId(parsed.subjectId ?? "");
      // If the parser invented a subject that doesn't exist yet, stage it for
      // confirmation rather than silently creating it.
      if (parsed.isNewSubject && parsed.subjectName) {
        setPendingSubjectName(parsed.subjectName);
        setPendingCategory((parsed.cognitiveCategory as CognitiveCategory) ?? "General");
      } else {
        setPendingSubjectName("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function confirmNewSubject() {
    if (!token || !pendingSubjectName) return;
    setError(null);
    try {
      const { subject } = await subjectsApi.create(token, {
        name: pendingSubjectName,
        cognitiveCategory: pendingCategory,
      });
      setSubjects((prev) => [...prev, subject]);
      setSubjectId(subject.id);
      setPendingSubjectName("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("A subject with that name already exists — pick it from the list.");
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create subject");
      }
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await tasksApi.create(token, {
        title,
        deadline: new Date(deadline).toISOString(),
        durationMin: Number(durationMin),
        priority,
        subjectId: subjectId || null,
      });
      router.push("/tasks");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* AI parse box */}
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-2 flex items-center gap-2">
          <SparkIcon width={18} height={18} className="text-primary" />
          <h2 className="text-sm font-semibold">Describe your task</h2>
        </div>
        <p className="mb-3 text-sm text-text-muted">
          Write it in plain English, e.g. &ldquo;Study Networking subnetting for 2 hours,
          urgent, due 30 Oct&rdquo;. We&rsquo;ll fill in the fields for you to review.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="Finish calculus problem sheet 4, about 90 minutes, due next week"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onParse}
            disabled={parsing || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <SparkIcon width={16} height={16} />
            {parsing ? "Parsing..." : "Parse task"}
          </button>
          {parseInfo && (
            <span className="text-xs text-text-muted">
              Parsed via {parseInfo.source}
            </span>
          )}
        </div>
      </div>

      {/* New-subject confirmation */}
      {pendingSubjectName && (
        <div className="rounded-card border border-amber/40 bg-amber/5 p-4">
          <p className="mb-3 text-sm">
            &ldquo;{pendingSubjectName}&rdquo; isn&rsquo;t one of your subjects yet. Create it?
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Cognitive category
              <select
                value={pendingCategory}
                onChange={(e) => setPendingCategory(e.target.value as CognitiveCategory)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={confirmNewSubject}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Create subject
            </button>
            <button
              onClick={() => setPendingSubjectName("")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Editable task form */}
      <form onSubmit={onSave} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Task details</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Deadline
            <input
              type="datetime-local"
              required
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Duration (minutes)
            <input
              type="number"
              min={5}
              required
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Subject
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
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

        <div>
          <button
            type="submit"
            disabled={saving || !title || !deadline}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save task"}
          </button>
        </div>
      </form>
    </div>
  );
}
