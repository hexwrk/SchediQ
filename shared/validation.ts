// Shared validation rules for SchediQ. This ONE file is imported by both the
// backend (wrapped in zod refinements) and the frontend (inline field errors),
// so the client and server can never disagree on what is valid.
//
// Deliberately dependency-free (no zod, no Node/DOM APIs): both toolchains
// compile it straight from source, so it must not pull in anything that only
// one side has installed.
//
// Every validator returns an error message string, or null when the value is
// valid. That shape maps directly onto zod's addIssue and onto a React
// "error under the input" pattern.

export type ValidationResult = string | null;

// ---------- Email ----------

// Local part: common unquoted characters only. Quoted local parts and IP
// literal domains are technically RFC-valid but never appear for real student
// accounts, so rejecting them removes a whole class of parser edge cases.
const LOCAL_PART = /^[A-Za-z0-9._%+-]+$/;
// One DNS label: alphanumerics and inner hyphens, 1-63 chars.
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
// TLD: letters only, at least 2 (rejects "a@b.c" and numeric TLDs).
const TLD = /^[A-Za-z]{2,63}$/;

export const EMAIL_RULE =
  "Enter a real email address, e.g. name@gmail.com (domain name of 2+ characters and a 2+ letter ending).";

// Rejects nonsensical addresses, not just syntactically broken ones.
// "yd@g.com" fails because the registrable label "g" is 1 char; "a@b.c" fails
// on the 1-letter TLD; "tristan@gmail.com" passes.
export function validateEmail(raw: string): ValidationResult {
  const email = raw.trim();
  if (!email) return "Email is required.";
  // RFC 5321 caps a forward path at 254 chars; anything longer is junk input.
  if (email.length > 254) return "Email is too long.";

  const at = email.indexOf("@");
  // Exactly one "@", with something on both sides.
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) {
    return EMAIL_RULE;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length > 64 || !LOCAL_PART.test(local)) return EMAIL_RULE;
  // Dots are allowed in the local part but not leading, trailing or doubled.
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return EMAIL_RULE;
  }

  const labels = domain.split(".");
  // Need at least "<name>.<tld>".
  if (labels.length < 2) return EMAIL_RULE;
  if (!labels.every((l) => DNS_LABEL.test(l))) return EMAIL_RULE;

  const tld = labels[labels.length - 1];
  if (!TLD.test(tld)) return EMAIL_RULE;

  // The label directly before the TLD is the registrable name ("gmail" in
  // gmail.com, "co" in co.za). A single character there is what makes
  // "yd@g.com" nonsensical, so require at least 2.
  const registrable = labels[labels.length - 2];
  if (registrable.length < 2) return EMAIL_RULE;

  return null;
}

// ---------- Password ----------

export const PASSWORD_MIN = 8;
// bcrypt silently truncates input beyond 72 bytes, so a longer password would
// give a false sense of extra strength. Cap it and say so.
export const PASSWORD_MAX = 72;
export const PASSWORD_RULE = `At least ${PASSWORD_MIN} characters, including at least one letter and one number.`;

export function validatePassword(pw: string): ValidationResult {
  if (!pw) return "Password is required.";
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(pw)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

// Heuristic strength hint for the register form. Purely advisory: the hard
// rule is validatePassword. Scores length and character-class variety.
export function passwordStrength(pw: string): PasswordStrength {
  if (validatePassword(pw)) return "weak";
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 3) return "strong";
  if (score === 2) return "good";
  return "fair";
}

// ---------- Text fields ----------

export function validateRequiredText(
  value: string,
  label: string,
  max: number,
  min = 1
): ValidationResult {
  const v = value.trim();
  if (v.length < min) return min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  if (v.length > max) return `${label} must be at most ${max} characters.`;
  return null;
}

export const NAME_MAX = 80;
export const TITLE_MAX = 200;
export const SUBJECT_NAME_MAX = 60;

// Display name is REQUIRED (User.name is NOT NULL). Whitespace-only counts as
// blank, so "   " is rejected rather than stored as an invisible name.
export function validateName(value: string): ValidationResult {
  return validateRequiredText(value, "Name", NAME_MAX);
}

// ---------- Numbers ----------

// Sensible bounds for every numeric input in the app. One table so the form
// hints, the client checks and the server zod schemas share the same numbers.
export const NUMBER_LIMITS = {
  durationMin: { label: "Duration", min: 5, max: 600, unit: "minutes" },
  maxDailyMins: { label: "Daily study limit", min: 30, max: 720, unit: "minutes" },
  breakMins: { label: "Break length", min: 0, max: 120, unit: "minutes" },
  lessonCount: { label: "Number of lessons", min: 2, max: 6, unit: "lessons" },
} as const;

export type NumberField = keyof typeof NUMBER_LIMITS;

// Accepts a number or the raw string from an <input>, so "", "abc", "-5" and
// "2.5" are all caught with a specific message instead of becoming NaN/0.
export function validateIntInRange(value: unknown, field: NumberField): ValidationResult {
  const { label, min, max, unit } = NUMBER_LIMITS[field];
  if (value === "" || value === null || value === undefined) return `${label} is required.`;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  if (!Number.isInteger(n)) return `${label} must be a whole number of ${unit}.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max} ${unit}.`;
  return null;
}

// ---------- Times / dates ----------

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateHHMM(value: string, label: string): ValidationResult {
  if (!value) return `${label} is required.`;
  if (!HHMM.test(value)) return `${label} must be a time in HH:MM (24h) format.`;
  return null;
}

// Window must have end strictly after start; HH:MM strings compare correctly
// lexicographically because they are zero-padded.
export function validateTimeWindow(start: string, end: string): ValidationResult {
  if (validateHHMM(start, "Start") || validateHHMM(end, "End")) return null;
  if (end <= start) return "Preferred end must be later than preferred start.";
  return null;
}

// Deadline: must parse and not be absurdly far out (guards typos like year
// 20266). Past deadlines are allowed on edit so overdue tasks stay editable.
export function validateDeadline(value: string): ValidationResult {
  if (!value) return "Deadline is required.";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "Deadline is not a valid date.";
  const year = new Date(t).getFullYear();
  if (year < 2000 || year > 2100) return "Deadline year must be between 2000 and 2100.";
  return null;
}

// ---------- Enums ----------

export const COGNITIVE_CATEGORIES = ["Analytical", "Verbal", "Technical", "General"] as const;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// ---------- Course generator ----------

export const COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];
export const TOPIC_MAX = 80;

// Topic must contain at least one letter: "!!!" or "1234" is not a subject
// anyone can learn, and it would be sent to the model verbatim.
export function validateTopic(value: string): ValidationResult {
  const base = validateRequiredText(value, "Topic", TOPIC_MAX, 2);
  if (base) return base;
  if (!/[A-Za-z]/.test(value)) return "Topic must contain letters, e.g. \"SQL joins\".";
  return null;
}

// ---------- Tier limits ----------

// FREE tier cap on AI parses per calendar day. PREMIUM is unlimited. Shared so
// the Upgrade page copy and the server gate quote the same number.
export const FREE_AI_PARSES_PER_DAY = 5;
// FREE tier cap on generated courses (lifetime). PREMIUM is unlimited.
export const FREE_COURSE_LIMIT = 2;
