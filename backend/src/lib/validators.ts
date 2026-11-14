import { z } from "zod";
import {
  COGNITIVE_CATEGORIES,
  COURSE_LEVELS,
  HEX_COLOR,
  NUMBER_LIMITS,
  NumberField,
  PasswordContext,
  SUBJECT_NAME_MAX,
  TITLE_MAX,
  ValidationResult,
  validateDeadline,
  validateEmail,
  validateHHMM,
  validateIntInRange,
  normalizeUsername,
  passwordErrors,
  usernameErrors,
  validateName,
  validateRequiredText,
  validateTopic,
} from "../../../shared/validation";

// zod adapters over the shared validators. The rules themselves live in
// shared/validation.ts (also imported by the frontend); this file only turns a
// "message | null" result into a zod issue so errors flow through the existing
// errorHandler as a 400 with per-field messages.

function fromShared<T>(check: (value: T) => ValidationResult) {
  return (value: T, ctx: z.RefinementCtx) => {
    const message = check(value);
    if (message) ctx.addIssue({ code: "custom", message });
  };
}

// Lower-cased so "Tristan@Gmail.com" and "tristan@gmail.com" cannot register as
// two accounts (the DB unique index is case-sensitive).
export const emailField = z
  .string()
  .trim()
  .superRefine(fromShared(validateEmail))
  .transform((v) => v.toLowerCase());

// One zod issue PER failing rule (not just the first), so the 400 lists every
// broken rule under the field, matching the form's live checklist.
function fromSharedAll<T>(check: (value: T) => string[]) {
  return (value: T, ctx: z.RefinementCtx) => {
    for (const message of check(value)) ctx.addIssue({ code: "custom", message });
  };
}

// The password rules depend on who the password is for (it must not contain
// their username or email name), so the field is built per request with that
// context. passwordField (no context) is for callers that have none.
export function passwordFieldFor(context: PasswordContext) {
  return z.string({ message: "Password is required." }).superRefine(fromSharedAll((v: string) => passwordErrors(v, context)));
}

export const passwordField = passwordFieldFor({});

// Trimmed and lower-cased BEFORE the rules run and before it is stored, so
// " Tristan" and "tristan" are the same name (the DB unique index is exact).
export const usernameField = z
  .string({ message: "Username is required." })
  .transform(normalizeUsername)
  .superRefine(fromSharedAll(usernameErrors));

// Pulls the identity fields out of an unparsed body for passwordFieldFor, so
// register can check the password against the username/email in the same pass.
export function passwordContextFrom(body: unknown): PasswordContext {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    username: typeof raw.username === "string" ? normalizeUsername(raw.username) : null,
    email: typeof raw.email === "string" ? raw.email : null,
  };
}

// Required: a missing name fails with the same message as a blank one.
export const nameField = z
  .string({ message: "Name is required." })
  .trim()
  .superRefine(fromShared(validateName));

export const topicField = z.string({ message: "Topic is required." }).trim().superRefine(fromShared(validateTopic));

export const courseLevelField = z.enum(COURSE_LEVELS, {
  message: `Level must be one of ${COURSE_LEVELS.join(", ")}.`,
});

export function intField(field: NumberField) {
  // number|string + refine instead of z.number().min().max() so "abc", NaN or a
  // negative gets the same human message the client shows. Not z.unknown():
  // that would also swallow undefined and break .optional()/.partial().
  const { label } = NUMBER_LIMITS[field];
  return z
    .union([z.number(), z.string()], { message: `${label} must be a number.` })
    .superRefine(fromShared((v: number | string) => validateIntInRange(v, field)))
    .transform((v) => Number(v));
}

export const titleField = z
  .string()
  .trim()
  .superRefine(fromShared((v: string) => validateRequiredText(v, "Title", TITLE_MAX)));

export const subjectNameField = z
  .string()
  .trim()
  .superRefine(fromShared((v: string) => validateRequiredText(v, "Subject name", SUBJECT_NAME_MAX)));

export const deadlineField = z
  .string()
  .superRefine(fromShared(validateDeadline))
  .transform((v) => new Date(v));

export const cognitiveCategoryField = z.enum(COGNITIVE_CATEGORIES, {
  message: `Category must be one of ${COGNITIVE_CATEGORIES.join(", ")}.`,
});

export const colorTagField = z.string().regex(HEX_COLOR, "Colour must be a #RRGGBB hex value.");

export function hhmmField(label: string) {
  return z.string().superRefine(fromShared((v: string) => validateHHMM(v, label)));
}

export { NUMBER_LIMITS };
