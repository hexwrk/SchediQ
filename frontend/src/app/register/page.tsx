"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  EMAIL_RULE,
  USERNAME_MAX,
  USERNAME_RULE,
  normalizeUsername,
  passwordErrors,
  usernameErrors,
  validateEmail,
  validateName,
  validateUsername,
} from "@shared/validation";
import { ApiError, authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, collectErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";
import { PasswordChecklist, passwordReady } from "@/lib/password";
import { useDebounced } from "@/lib/search";

type Field = "name" | "email" | "username" | "password";
const FIELDS: Field[] = ["name", "email", "username", "password"];

// Result of the last availability lookup, keyed by the name it was for, so a
// stale answer for "tris" is never shown while the box says "tristan".
interface Availability {
  username: string;
  available: boolean;
  reasons: string[];
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  // Fields the user has left at least once: errors show on blur, not on the
  // first keystroke, then update live.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);

  const normalized = normalizeUsername(username);
  const formatProblems = usernameErrors(username);
  const debouncedUsername = useDebounced(normalized, 400);

  // Availability is only asked for a name that already passes the format
  // rules (those are checked locally). State is only set in the promise
  // callback, never synchronously in the effect body.
  useEffect(() => {
    if (!debouncedUsername || usernameErrors(debouncedUsername).length > 0) return;
    const ctrl = new AbortController();
    authApi.usernameAvailable(debouncedUsername, ctrl.signal).then(
      (r) => setAvailability(r),
      // Network/rate-limit failure: leave it unknown; the server re-checks on submit.
      () => undefined
    );
    return () => ctrl.abort();
  }, [debouncedUsername]);

  const checked = availability && availability.username === normalized ? availability : null;
  const usernameStatus: "idle" | "checking" | "available" | "taken" =
    !normalized || formatProblems.length > 0 ? "idle" : !checked ? "checking" : checked.available ? "available" : "taken";

  const ctx = { username: normalized, email };

  function validate(values = { name, email, username, password }) {
    return collectErrors<Field>({
      name: validateName(values.name),
      email: validateEmail(values.email),
      username: validateUsername(values.username),
      password: passwordErrors(values.password, { username: normalizeUsername(values.username), email: values.email })[0] ?? null,
    });
  }

  function update(field: Field, value: string) {
    const next = { name, email, username, password, [field]: value };
    if (field === "name") setName(value);
    if (field === "email") setEmail(value);
    if (field === "username") setUsername(value);
    if (field === "password") setPassword(value);
    if (touched[field]) setErrors((e) => ({ ...e, [field]: validate(next)[field] }));
  }

  function blur(field: Field) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: validate()[field] }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Block submit on any invalid field; the server re-checks the same rules.
    const found = validate();
    if (!found.username && usernameStatus === "taken") found.username = "That username is already taken.";
    setTouched({ name: true, email: true, username: true, password: true });
    setErrors(found);
    if (hasErrors(found)) return;

    setSubmitting(true);
    try {
      await register(email.trim(), normalized, password, name.trim());
      router.push("/dashboard");
    } catch (err) {
      const fromServer = serverFieldErrors(err, FIELDS);
      setErrors(fromServer);
      if (!hasErrors(fromServer)) {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    passwordReady(password, ctx) &&
    formatProblems.length === 0 &&
    usernameStatus !== "taken" &&
    !validateName(name) &&
    !validateEmail(email);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-8">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-7"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-solid">
            SQ
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Sign up</h1>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => update("name", e.target.value)}
            onBlur={() => blur("name")}
            aria-invalid={!!errors.name}
            className={inputClass(errors.name)}
          />
          <FieldError message={errors.name} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            maxLength={USERNAME_MAX + 10}
            onChange={(e) => update("username", e.target.value)}
            onBlur={() => blur("username")}
            aria-invalid={!!errors.username || usernameStatus === "taken"}
            aria-describedby="username-status"
            className={inputClass(errors.username || (usernameStatus === "taken" ? "taken" : null))}
          />
          <span id="username-status" className="flex flex-col gap-0.5 text-xs" aria-live="polite">
            {username && formatProblems.length > 0 ? (
              formatProblems.map((p) => (
                <span key={p} className="text-red-600">
                  {p}
                </span>
              ))
            ) : usernameStatus === "checking" ? (
              <span className="text-text-muted">Checking availability of {normalized}...</span>
            ) : usernameStatus === "available" ? (
              <span className="text-accent">{normalized} is available.</span>
            ) : usernameStatus === "taken" ? (
              <span className="text-red-600">{checked?.reasons[0] ?? "That username is already taken."}</span>
            ) : errors.username ? null : (
              <span className="text-text-muted">{USERNAME_RULE}</span>
            )}
          </span>
          {errors.username && !formatProblems.includes(errors.username) && <FieldError message={errors.username} />}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => update("email", e.target.value)}
            onBlur={() => blur("email")}
            aria-invalid={!!errors.email}
            className={inputClass(errors.email)}
          />
          {errors.email ? (
            <FieldError message={errors.email} />
          ) : (
            <span className="text-xs text-text-muted">{EMAIL_RULE}</span>
          )}
          <span className="text-xs text-text-muted">You log in with your email.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => update("password", e.target.value)}
            onBlur={() => blur("password")}
            aria-invalid={!!errors.password}
            aria-describedby="password-rules"
            className={inputClass(errors.password)}
          />
          <PasswordChecklist id="password-rules" password={password} context={ctx} />
          <FieldError message={errors.password} />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Sign up"}
        </button>

        <p className="text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
