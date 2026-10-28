"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  EMAIL_RULE,
  PASSWORD_RULE,
  passwordStrength,
  validateEmail,
  validateName,
  validatePassword,
} from "@shared/validation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, collectErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";

type Field = "name" | "email" | "password";
const FIELDS: Field[] = ["name", "email", "password"];

const STRENGTH = {
  weak: { label: "Weak", color: "#dc2626", width: "25%" },
  fair: { label: "Fair", color: "var(--amber)", width: "50%" },
  good: { label: "Good", color: "var(--primary)", width: "75%" },
  strong: { label: "Strong", color: "var(--accent)", width: "100%" },
} as const;

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  // Fields the user has left at least once: errors show on blur, not on the
  // first keystroke, then update live.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(values = { name, email, password }) {
    return collectErrors<Field>({
      name: validateName(values.name),
      email: validateEmail(values.email),
      password: validatePassword(values.password),
    });
  }

  function update(field: Field, value: string) {
    const next = { name, email, password, [field]: value };
    if (field === "name") setName(value);
    if (field === "email") setEmail(value);
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
    setTouched({ name: true, email: true, password: true });
    setErrors(found);
    if (hasErrors(found)) return;

    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim());
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

  const strength = password ? STRENGTH[passwordStrength(password)] : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-7"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
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
            className={inputClass(errors.password)}
          />
          {strength && (
            <span className="flex items-center gap-2 text-xs text-text-muted">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                <span
                  className="block h-full rounded-full transition-all"
                  style={{ width: strength.width, background: strength.color }}
                />
              </span>
              <span style={{ color: strength.color }}>{strength.label}</span>
            </span>
          )}
          {errors.password ? (
            <FieldError message={errors.password} />
          ) : (
            <span className="text-xs text-text-muted">{PASSWORD_RULE}</span>
          )}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
