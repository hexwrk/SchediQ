"use client";

import { FormEvent, useState } from "react";
import { SUBJECT_NAME_MAX, validateRequiredText } from "@shared/validation";
import { ApiError, CognitiveCategory, Subject, subjectsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, inputClass, serverFieldErrors } from "@/lib/form";
import { PlusIcon } from "@/lib/icons";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";

const CATEGORIES: CognitiveCategory[] = ["Analytical", "Verbal", "Technical", "General"];
const SWATCHES = ["#3454D1", "#0E9E7E", "#D98324", "#6B52E0", "#DC2626", "#0891B2"];

const emptyForm = {
  name: "",
  cognitiveCategory: "General" as CognitiveCategory,
  colorTag: SWATCHES[0],
};

const byName = (a: Subject, b: Subject) => a.name.localeCompare(b.name);

export default function SubjectsPage() {
  const { token } = useAuth();
  const { data, error, loading, reload, reloading, mutate } = useApi("subjects", (t) =>
    subjectsApi.list(t).then((r) => r.subjects)
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nameError, setNameError] = useState<string | null>(null);
  const subjects = data ?? [];

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
    setNameError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setActionError(null);
    // Same rule as the server (shared/validation.ts); also catches the common
    // case-insensitive duplicate before a round trip.
    const trimmed = form.name.trim();
    let nameErr = validateRequiredText(trimmed, "Subject name", SUBJECT_NAME_MAX);
    if (!nameErr && subjects.some((s) => s.id !== editingId && s.name.toLowerCase() === trimmed.toLowerCase())) {
      nameErr = "You already have a subject with that name.";
    }
    setNameError(nameErr);
    if (nameErr) return;
    try {
      const payload = { ...form, name: trimmed };
      if (editingId) {
        const { subject } = await subjectsApi.update(token, editingId, payload);
        mutate((prev) => prev.map((s) => (s.id === subject.id ? subject : s)).sort(byName));
      } else {
        const { subject } = await subjectsApi.create(token, payload);
        mutate((prev) => [...prev, subject].sort(byName));
      }
      reset();
    } catch (err) {
      const fields = serverFieldErrors(err, ["name", "cognitiveCategory", "colorTag"] as const);
      if (err instanceof ApiError && err.status === 409) setNameError("You already have a subject with that name.");
      else if (fields.name) setNameError(fields.name);
      else setActionError(errorMessage(err, "Failed to save subject"));
    }
  }

  function startEdit(s: Subject) {
    setEditingId(s.id);
    setNameError(null);
    setForm({ name: s.name, cognitiveCategory: s.cognitiveCategory as CognitiveCategory, colorTag: s.colorTag });
  }

  async function remove(s: Subject) {
    if (!token) return;
    if (!window.confirm(`Delete "${s.name}"? Its tasks are kept but will no longer have a subject.`)) return;
    setActionError(null);
    try {
      await subjectsApi.remove(token, s.id);
      mutate((prev) => prev.filter((x) => x.id !== s.id));
      if (editingId === s.id) reset();
    } catch (err) {
      setActionError(errorMessage(err, "Failed to delete"));
    }
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-2">
        {actionError && <ErrorState title="That didn't work" message={actionError} />}
        {loading ? (
          <LoadingState label="Loading subjects" />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} retrying={reloading} />
        ) : subjects.length === 0 ? (
          <EmptyState
            title="No subjects yet"
            body="Subjects group your tasks and courses, and each one gets a mastery score. Start with the modules you are studying this semester using the form."
          />
        ) : (
          subjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: s.colorTag }} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-text-muted">{s.cognitiveCategory}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                <button onClick={() => startEdit(s)} className="text-primary hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(s)} className="text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex h-fit flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">{editingId ? "Edit subject" : "New subject"}</h2>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            value={form.name}
            maxLength={SUBJECT_NAME_MAX + 20}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }));
              if (nameError) setNameError(validateRequiredText(e.target.value, "Subject name", SUBJECT_NAME_MAX));
            }}
            aria-invalid={!!nameError}
            className={inputClass(nameError)}
          />
          <FieldError message={nameError} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Cognitive category
          <select
            value={form.cognitiveCategory}
            onChange={(e) => setForm((f) => ({ ...f, cognitiveCategory: e.target.value as CognitiveCategory }))}
            className={inputClass(null)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          Colour
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, colorTag: c }))}
                className={`h-7 w-7 rounded-full border-2 ${form.colorTag === c ? "border-text" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90"
          >
            {!editingId && <PlusIcon width={16} height={16} />}
            {editingId ? "Save changes" : "Add subject"}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
