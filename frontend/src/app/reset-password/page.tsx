"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { authApi } from "@/lib/api";
import { FieldError, inputClass, serverFieldErrors } from "@/lib/form";
import { PasswordChecklist, passwordReady } from "@/lib/password";
import { errorMessage } from "@/lib/use-api";

// Step 2 of password reset: ?token=... from the link, then a new password.
// useSearchParams needs a Suspense boundary so the rest of the page can still
// be prerendered (Next 16 requirement).
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-7">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-solid">SQ</span>
          <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        </div>
        <Suspense fallback={<p className="text-sm text-text-muted">Loading...</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-red-600">This reset link is missing its token.</p>
        <Link href="/forgot-password" className="text-primary hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // The link only carries a token, so the page cannot know the account's
    // username/email: that one rule is enforced by the server on submit.
    const found = {
      password: passwordReady(password, null) ? undefined : "Meet every password requirement below.",
      confirm: password !== confirm ? "Passwords do not match." : undefined,
    };
    setErrors(found);
    if (found.password || found.confirm) return;
    setSaving(true);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      const fromServer = serverFieldErrors(err, ["password"] as const);
      setErrors(fromServer);
      if (!fromServer.password) setError(errorMessage(err, "Could not reset the password"));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-accent">Password updated. You can now log in with your new password.</p>
        <Link href="/login" className="rounded-lg bg-primary px-4 py-2 text-center font-medium text-on-solid hover:opacity-90">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby="reset-password-rules"
          className={inputClass(errors.password)}
        />
        <PasswordChecklist id="reset-password-rules" password={password} context={null} />
        <FieldError message={errors.password} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!errors.confirm}
          className={inputClass(errors.confirm)}
        />
        <FieldError message={errors.confirm} />
      </label>
      {error && (
        <p className="text-sm text-red-600">
          {error}{" "}
          <Link href="/forgot-password" className="text-primary hover:underline">
            Request a new link
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !passwordReady(password, null) || password !== confirm}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}
