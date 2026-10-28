"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
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
import { toLocalInput } from "@/lib/dates";
import { ErrorState } from "@/lib/states";
import { useApi } from "@/lib/use-api";
import { NUMBER_LIMITS, TITLE_MAX } from "@shared/validation";
import {
  FieldError,
  FieldErrors,
  TASK_FIELDS,
  TaskField,
  UpgradePrompt,
  hasErrors,
  inputClass,
  serverFieldErrors,
  validateTaskForm,
} from "@/lib/form";

const CATEGORIES: CognitiveCategory[] = ["Analytical", "Verbal", "Technical", "General"];

export default function AddTaskPage() {
  const { token } = useAuth();
  const router = useRouter();

  // Subjects only fill the dropdown; if they fail to load the form still works
  // (task saved without a subject) and a warning with Retry is shown.
  const subjectsQuery = useApi("subjects", (t) => subjectsApi.list(t).then((r) => r.subjects));
  const [extraSubjects, setExtraSubjects] = useState<Subject[]>([]);
  const subjects = [...(subjectsQuery.data ?? []), ...extraSubjects];
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<ParsedTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable task fields (prefilled by the parser, overridable by the user).
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  // Raw input string; validated with validateIntInRange before saving.
  const [durationMin, setDurationMin] = useState("60");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TaskField>>({});
  // Set when the FREE daily parse cap is hit (402): shows the upgrade prompt.
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [subjectId, setSubjectId] = useState("");

  // New-subject confirmation state (shown when the parser flags isNewSubject).
  const [pendingSubjectName, setPendingSubjectName] = useState("");
  const [pendingCategory, setPendingCategory] = useState<CognitiveCategory>("General");

  async function onParse() {
    if (!token || !text.trim()) return;
    setParsing(true);
    setError(null);
    setUpgradeMsg(null);
    try {
      const parsed = await aiApi.parse(token, text);
      setParseInfo(parsed);
      setTitle(parsed.title);
      setDeadline(toLocalInput(parsed.deadline));
      setDurationMin(String(parsed.durationMin));
      setFieldErrors({});
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
      if (err instanceof ApiError && err.upgradeRequired) {
        setUpgradeMsg(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Parse failed");
      }
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
      setExtraSubjects((prev) => [...prev, subject]);
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
    const found = validateTaskForm({ title, deadline, durationMin });
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    setError(null);
    try {
      await tasksApi.create(token, {
        title: title.trim(),
        deadline: new Date(deadline).toISOString(),
        durationMin: Number(durationMin),
        priority,
        subjectId: subjectId || null,
      });
      router.push("/tasks");
    } catch (err) {
      const fromServer = serverFieldErrors(err, TASK_FIELDS);
      setFieldErrors(fromServer);
      if (!hasErrors(fromServer)) setError(err instanceof ApiError ? err.message : "Failed to save task");
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
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="Finish calculus problem sheet 4, about 90 minutes, due next week"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onParse}
            disabled={parsing || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
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

      {upgradeMsg && <UpgradePrompt message={upgradeMsg} />}
      {subjectsQuery.error && (
        <ErrorState
          title="Couldn't load your subjects"
          message={`${subjectsQuery.error} You can still save the task without a subject.`}
          onRetry={subjectsQuery.reload}
          retrying={subjectsQuery.reloading}
        />
      )}

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
                className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
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
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90"
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
      <form onSubmit={onSave} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Task details</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Title
            <input
              value={title}
              maxLength={TITLE_MAX + 20}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!fieldErrors.title}
              className={inputClass(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Deadline
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-invalid={!!fieldErrors.deadline}
              className={inputClass(fieldErrors.deadline)}
            />
            <FieldError message={fieldErrors.deadline} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Duration (minutes)
            <input
              type="number"
              inputMode="numeric"
              min={NUMBER_LIMITS.durationMin.min}
              max={NUMBER_LIMITS.durationMin.max}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              aria-invalid={!!fieldErrors.durationMin}
              className={inputClass(fieldErrors.durationMin)}
            />
            {fieldErrors.durationMin ? (
              <FieldError message={fieldErrors.durationMin} />
            ) : (
              <span className="text-xs text-text-muted">
                {NUMBER_LIMITS.durationMin.min}-{NUMBER_LIMITS.durationMin.max} minutes
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="rounded-lg border border-input bg-surface px-3 py-2 outline-none focus:border-primary"
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
              className="rounded-lg border border-input bg-surface px-3 py-2 outline-none focus:border-primary"
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
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save task"}
          </button>
        </div>
      </form>
    </div>
  );
}
