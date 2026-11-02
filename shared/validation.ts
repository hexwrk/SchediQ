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

export const PASSWORD_MIN = 12;
// bcrypt silently truncates input beyond 72 bytes, so a longer password would
// give a false sense of extra strength. Cap it and say so.
export const PASSWORD_MAX = 72;
export const PASSWORD_RULE = `At least ${PASSWORD_MIN} characters with an uppercase letter, a lowercase letter, a number and a symbol. Must not contain your username or email name, or be a common password.`;

// Small shipped blocklist of the passwords credential-stuffing lists try
// first. Matched after stripping leading/trailing digits and symbols and
// undoing common l33t swaps, so "Password123!" and "P@ssw0rd!!" are caught by
// the single entry "password" even though they pass the composition rules.
export const COMMON_PASSWORDS: readonly string[] = [
  "password", "passwort", "passcode", "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbnm",
  "letmein", "welcome", "admin", "administrator", "iloveyou", "monkey", "dragon", "football",
  "baseball", "soccer", "sunshine", "princess", "superman", "batman", "trustno", "master",
  "shadow", "michael", "jennifer", "abc", "abcdef", "changeme", "secret", "login", "starwars",
  "whatever", "hello", "freedom", "computer", "internet", "schediq", "student", "summer",
  "winter", "spring", "autumn", "january", "december", "pokemon", "minecraft", "liverpool",
  "chelsea", "arsenal", "manchester", "springbok", "pretoria", "johannesburg", "richfield",
  "qazwsx", "default", "guest", "test", "user", "root", "access", "flower", "hunter", "killer",
];
// Exact entries that are already all digits/symbols, so the stripping above
// would reduce them to "" (they also fail composition, but say why).
const COMMON_EXACT: readonly string[] = ["123456", "12345678", "123456789", "1234567890", "111111", "000000", "123123", "654321"];
const COMMON_SET = new Set(COMMON_PASSWORDS);

const LEET: Record<string, string> = { "@": "a", "4": "a", "0": "o", "1": "i", "!": "i", "3": "e", "$": "s", "5": "s", "7": "t", "9": "g" };

export function isCommonPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON_EXACT.includes(lower)) return true;
  // Strip the digits/symbols people bolt on to satisfy composition rules.
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!core) return false;
  const unleet = core.replace(/[@40135$79!]/g, (c) => LEET[c] ?? c);
  // Repeats like "passwordpassword" are no stronger than the word itself, so
  // also test the smallest repeating unit.
  const unit = (v: string) => v.replace(/^(.+?)\1+$/, "$1");
  const variants = [core, unleet, unleet.replace(/[^a-z]/g, "")];
  return variants.some((v) => COMMON_SET.has(v) || COMMON_SET.has(unit(v)));
}

// Who the password belongs to, for the "must not contain" rules. Both sides
// pass it: the register form has the typed values, the server has the row.
export interface PasswordContext {
  username?: string | null;
  email?: string | null;
}

export type PasswordRuleId = "length" | "upper" | "lower" | "digit" | "symbol" | "max" | "personal" | "common";

export interface PasswordRuleCheck {
  id: PasswordRuleId;
  // Checklist wording (what to do).
  label: string;
  // Error wording (what is wrong), used in field errors and the API's 400.
  message: string;
  passed: boolean;
}

// Personal fragments that must not appear in the password. Shorter than 3
// characters is skipped: banning "jo" would reject half the dictionary.
function personalParts(ctx: PasswordContext): string[] {
  const parts: string[] = [];
  const username = ctx.username?.trim().toLowerCase();
  if (username) parts.push(username);
  const email = ctx.email?.trim().toLowerCase();
  if (email && email.includes("@")) {
    // "first.last+tag@x" -> "first.last"; the +tag is noise, not identity.
    parts.push(email.slice(0, email.indexOf("@")).split("+")[0]);
  }
  return parts.filter((p) => p.length >= 3);
}

// Every rule with pass/fail, in checklist order. The UI renders this list
// live; validatePassword and the zod schema read the same list, so the
// checklist can never show green for something the server rejects.
export function passwordChecks(pw: string, ctx: PasswordContext = {}): PasswordRuleCheck[] {
  const lower = pw.toLowerCase();
  const personal = personalParts(ctx);
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, message: `Password must be at least ${PASSWORD_MIN} characters.`, passed: pw.length >= PASSWORD_MIN },
    { id: "upper", label: "An uppercase letter (A-Z)", message: "Password must contain an uppercase letter.", passed: /[A-Z]/.test(pw) },
    { id: "lower", label: "A lowercase letter (a-z)", message: "Password must contain a lowercase letter.", passed: /[a-z]/.test(pw) },
    { id: "digit", label: "A number (0-9)", message: "Password must contain a number.", passed: /[0-9]/.test(pw) },
    { id: "symbol", label: "A symbol (e.g. ! @ # - _)", message: "Password must contain a symbol such as ! @ # - or _.", passed: /[^A-Za-z0-9]/.test(pw) },
    { id: "max", label: `At most ${PASSWORD_MAX} characters`, message: `Password must be at most ${PASSWORD_MAX} characters.`, passed: pw.length <= PASSWORD_MAX },
    {
      id: "personal",
      label: "Does not contain your username or email name",
      message: "Password must not contain your username or the name part of your email.",
      passed: !personal.some((p) => lower.includes(p)),
    },
    { id: "common", label: "Not a common password", message: "That password is too common. Choose something less predictable.", passed: !!pw && !isCommonPassword(pw) },
  ];
}

// Every failing rule's message (empty = valid). The server returns all of them
// so the form can show each broken rule at once.
export function passwordErrors(pw: string, ctx: PasswordContext = {}): string[] {
  if (!pw) return ["Password is required."];
  return passwordChecks(pw, ctx)
    .filter((c) => !c.passed)
    .map((c) => c.message);
}

export function validatePassword(pw: string, ctx: PasswordContext = {}): ValidationResult {
  return passwordErrors(pw, ctx)[0] ?? null;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

// Strength meter. Anything that breaks a rule is "weak" (and cannot be
// submitted); above that, extra length and a 4th character class score up.
export function passwordStrength(pw: string, ctx: PasswordContext = {}): PasswordStrength {
  if (validatePassword(pw, ctx)) return "weak";
  let score = 0;
  if (pw.length >= 14) score++;
  if (pw.length >= 18) score++;
  // Two or more symbols, or symbols not at the end, beat the "Word123!" habit.
  if ((pw.match(/[^A-Za-z0-9]/g) ?? []).length >= 2 || /[^A-Za-z0-9][A-Za-z0-9]/.test(pw)) score++;
  if (score >= 2) return "strong";
  if (score === 1) return "good";
  return "fair";
}

// ---------- Username ----------

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RULE = `${USERNAME_MIN}-${USERNAME_MAX} characters: lowercase letters, numbers and underscores, starting with a letter.`;

// Names that would impersonate the system or collide with routes. Kept in
// sync with the backfill migration (20261101090000_user_username), which a
// test checks, so a backfilled user can never land on one of these.
export const RESERVED_USERNAMES: readonly string[] = [
  "admin", "administrator", "root", "system", "sysadmin", "superuser", "api", "support", "help",
  "staff", "moderator", "mod", "owner", "security", "schediq", "official", "null", "undefined",
  "anonymous", "guest", "user", "users", "account", "login", "logout", "register", "signup",
  "settings", "dashboard", "reports", "me", "test", "www", "mail", "noreply", "postmaster",
];

// Applied before validating AND before storing, so "  Tristan " and "tristan"
// are the same account name.
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

// Every failing rule for an already-normalised username (empty = valid).
export function usernameErrors(raw: string): string[] {
  const u = normalizeUsername(raw);
  if (!u) return ["Username is required."];
  const out: string[] = [];
  if (u.length < USERNAME_MIN) out.push(`Username must be at least ${USERNAME_MIN} characters.`);
  if (u.length > USERNAME_MAX) out.push(`Username must be at most ${USERNAME_MAX} characters.`);
  if (/\s/.test(u)) out.push("Username cannot contain spaces.");
  if (!/^[a-z]/.test(u)) out.push("Username must start with a letter.");
  if (/[^a-z0-9_\s]/.test(u)) out.push("Username can only use lowercase letters, numbers and underscores.");
  if (RESERVED_USERNAMES.includes(u)) out.push("That username is reserved. Choose another.");
  return out;
}

export function validateUsername(raw: string): ValidationResult {
  return usernameErrors(raw)[0] ?? null;
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

// Master switch for the Free plan caps below. OFF for the demo: every account,
// FREE included, gets every feature with no limits, and Premium is only a
// "future update" preview (docs/ROADMAP.md). Set to true to re-enable the caps
// and the 402 UPGRADE_REQUIRED gates in the AI and courses controllers.
export const TIER_LIMITS_ENABLED = false;

// FREE tier cap on AI parses per calendar day. PREMIUM is unlimited. Shared so
// the Upgrade page copy and the server gate quote the same number.
export const FREE_AI_PARSES_PER_DAY = 5;
// FREE tier cap on generated courses (lifetime). PREMIUM is unlimited.
export const FREE_COURSE_LIMIT = 2;
