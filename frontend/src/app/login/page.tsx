"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, hasErrors, inputClass } from "@/lib/form";

type Field = "email" | "password";

// Login checks presence/shape only. The full "real address" rule is for
// sign-up; applying it here would just tell an attacker which addresses the
// app considers valid, while the server answers every bad login identically.
function validateLogin(email: string, password: string): FieldErrors<Field> {
  const out: FieldErrors<Field> = {};
  if (!email.trim()) out.email = "Email is required.";
  else if (!email.includes("@")) out.email = "Enter your email address, e.g. name@gmail.com.";
  if (!password) out.password = "Password is required.";
  return out;
}

export default function LoginPage() {
  const { login, notice } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const found = validateLogin(email, password);
    setErrors(found);
    if (hasErrors(found)) return;
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-7"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-solid">
            SQ
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
        </div>

        {notice && (
          <p role="status" className="rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-sm">
            {notice}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            className={inputClass(errors.email)}
          />
          <FieldError message={errors.email} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            className={inputClass(errors.password)}
          />
          <FieldError message={errors.password} />
          <Link href="/forgot-password" className="self-end text-xs text-primary hover:underline">
            Forgot password?
          </Link>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>

        <p className="text-sm text-text-muted">
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
