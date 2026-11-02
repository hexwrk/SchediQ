"use client";

import {
  TITLE_MAX,
  validateDeadline,
  validateIntInRange,
  validateRequiredText,
} from "@shared/validation";
import { ApiError } from "./api";

// Shared form plumbing. The RULES live in shared/validation.ts (same module the
// backend uses); this file only renders their messages consistently.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

// Input styling: red border when the field has an error.
export function inputClass(error?: string | null, extra = "") {
  return `rounded-lg border bg-surface px-3 py-2 outline-none ${
    // --input (not --border): form fields need >= 3:1 boundary contrast.
    error ? "border-red-500 focus:border-red-600" : "border-input focus:border-primary"
  } ${extra}`;
}

// Error text rendered directly under its input. role="alert" so screen readers
// announce it when it appears.
export function FieldError({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="text-xs font-normal text-red-600">
      {message}
    </span>
  );
}

// Run every validator; returns only the failing fields.
export function collectErrors<K extends string>(checks: Record<K, string | null>): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const key of Object.keys(checks) as K[]) {
    if (checks[key]) out[key] = checks[key] as string;
  }
  return out;
}

export function hasErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

// Merge server-side zod field errors (a 400) into the form's field errors, so a
// rule only the server can check still lands under the right input.
export function serverFieldErrors<K extends string>(err: unknown, fields: readonly K[]): FieldErrors<K> {
  if (!(err instanceof ApiError)) return {};
  const out: FieldErrors<K> = {};
  for (const f of fields) {
    const msg = err.field(f);
    if (msg) out[f] = msg;
  }
  return out;
}

// Task form rules, shared by Add task and the inline edit on Task list. Duration
// arrives as the raw input string so "" and "-5" get specific messages.
export type TaskField = "title" | "deadline" | "durationMin" | "subjectId";
export const TASK_FIELDS: TaskField[] = ["title", "deadline", "durationMin", "subjectId"];

export function validateTaskForm(f: { title: string; deadline: string; durationMin: string }): FieldErrors<TaskField> {
  return collectErrors<Exclude<TaskField, "subjectId">>({
    title: validateRequiredText(f.title, "Title", TITLE_MAX),
    deadline: validateDeadline(f.deadline),
    durationMin: validateIntInRange(f.durationMin, "durationMin"),
  });
}
