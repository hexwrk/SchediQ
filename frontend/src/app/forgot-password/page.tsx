"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { validateEmail } from "@shared/validation";
import { authApi } from "@/lib/api";
import { FieldError, inputClass } from "@/lib/form";
import { errorMessage } from "@/lib/use-api";

// Step 1 of password reset: request a link. The server answers the same way
// whether or not the email exists. DEMO MODE: there is no email service, so
// the link is shown on screen (and logged by the API) instead of emailed.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ message: string; resetUrl?: string; expires?: number } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const msg = validateEmail(email);
    setEmailError(msg);
    if (msg) return;
    setSending(true);
    try {
      const res = await authApi.forgot(email.trim());
      setSent({ message: res.message, resetUrl: res.resetUrl, expires: res.expiresInMinutes });
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset link"));
    } finally {
      setSending(false);
    }
  }

  // Same-origin path from the absolute demo URL, so it works behind any host.
  const resetPath = sent?.resetUrl ? new URL(sent.resetUrl).pathname + new URL(sent.resetUrl).search : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-7">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-solid">SQ</span>
          <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        </div>

        {sent ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>{sent.message}</p>
            {resetPath ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber/40 bg-amber/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber">Demo mode: no email is sent</p>
                <p className="text-xs text-text-muted">
                  In production this link would be emailed. It works once and expires in {sent.expires ?? 30} minutes.
                </p>
                <Link href={resetPath} className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-on-solid hover:opacity-90">
                  Open reset link
                </Link>
              </div>
            ) : (
              <p className="text-text-muted">Check your inbox. The link expires in 30 minutes.</p>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">Enter your account email and we&rsquo;ll send a link to set a new password.</p>
            <label className="flex flex-col gap-1 text-sm">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailError}
                className={inputClass(emailError)}
              />
              <FieldError message={emailError} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <Link href="/login" className="text-sm text-primary hover:underline">
          &larr; Back to log in
        </Link>
      </div>
    </div>
  );
}
