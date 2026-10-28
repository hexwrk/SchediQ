"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  CognitiveCategory,
  Subject,
  subjectsApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PlusIcon } from "@/lib/icons";
import { SUBJECT_NAME_MAX, validateRequiredText } from "@shared/validation";
import { FieldError, inputClass, serverFieldErrors } from "@/lib/form";

const CATEGORIES: CognitiveCategory[] = ["Analytical", "Verbal", "Technical", "General"];
const SWATCHES = ["#3454D1", "#0E9E7E", "#D98324", "#6B52E0", "#DC2626", "#0891B2"];

const emptyForm = {
  name: "",
  cognitiveCategory: "General" as CognitiveCategory,
  colorTag: SWATCHES[0],
};

export default function SubjectsPage() {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    subjectsApi
      .list(token)
      .then((r) => setSubjects(r.subjects))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
    setNameError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    // Same rule as the server (shared/validation.ts); also catches the common
    // case-insensitive duplicate before a round trip.
    const trimmed = form.name.trim();
    let nameErr = validateRequiredText(trimmed, "Subject name", SUBJECT_NAME_MAX);
    if (
      !nameErr &&
      subjects.some((s) => s.id !== editingId && s.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      nameErr = "You already have a subject with that name.";
    }
    setNameError(nameErr);
    if (nameErr) return;
    try {
      if (editingId) {
        const { subject } = await subjectsApi.update(token, editingId, form);
        setSubjects((prev) => prev.map((s) => (s.id === subject.id ? subject : s)));
      } else {
        const { subject } = await subjectsApi.create(token, form);
        setSubjects((prev) => [...prev, subject].sort((a, b) => a.name.localeCompare(b.name)));
      }
      reset();
    } catch (err) {
      const fields = serverFieldErrors(err, ["name", "cognitiveCategory", "colorTag"] as const);
      if (err instanceof ApiError && err.status === 409) {
        setNameError("You already have a subject with that name.");
      } else if (fields.name) {
        setNameError(fields.name);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to save subject");
      }
    }
  }

  function startEdit(s: Subject) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      cognitiveCategory: s.cognitiveCategory as CognitiveCategory,
      colorTag: s.colorTag,
    });
  }

  async function remove(id: string) {
    if (!token) return;
    try {
      await subjectsApi.remove(token, id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
      {/* List */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <p className="text-sm text-text-muted">Loading subjects...</p>
        ) : subjects.length === 0 ? (
          <p className="text-sm text-text-muted">No subjects yet. Create one on the right.</p>
        ) : (
          subjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ background: s.colorTag }} />
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-text-muted">{s.cognitiveCategory}</p>
                </div>
              </div>
              <div className="flex gap-3 text-sm">
                <button onClick={() => startEdit(s)} className="text-primary hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / edit form */}
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex h-fit flex-col gap-4 rounded-card border border-border bg-surface p-5"
      >
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
            onChange={(e) =>
              setForm((f) => ({ ...f, cognitiveCategory: e.target.value as CognitiveCategory }))
            }
            className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
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
                className={`h-7 w-7 rounded-full border-2 ${
                  form.colorTag === c ? "border-text" : "border-transparent"
                }`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {!editingId && <PlusIcon width={16} height={16} />}
            {editingId ? "Save changes" : "Add subject"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
