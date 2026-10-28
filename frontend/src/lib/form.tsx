"use client";

import Link from "next/link";
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
    error ? "border-red-500 focus:border-red-600" : "border-border focus:border-primary"
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

// Friendly replacement for a 402 tier-cap error.
export function UpgradePrompt({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-violet/40 bg-violet/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-violet">Upgrade to Premium</p>
        <p className="text-sm text-text-muted">{message}</p>
      </div>
      <Link
        href="/upgrade"
        className="shrink-0 rounded-lg bg-violet px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90"
      >
        See Premium
      </Link>
    </div>
  );
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
