"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { accountApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";
import { errorMessage } from "@/lib/use-api";

type Field = "password" | "confirm";

// Profile summary and self-service account deletion.
export default function AccountPage() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    const found: FieldErrors<Field> = {};
    if (!password) found.password = "Enter your password to confirm.";
    if (confirm !== "DELETE") found.confirm = "Type DELETE (in capitals) to confirm.";
    setErrors(found);
    if (hasErrors(found)) return;
    if (!window.confirm("Permanently delete your account and everything in it? This cannot be undone.")) return;

    setDeleting(true);
    try {
      await accountApi.remove(token, password);
      logout();
      router.replace("/login?deleted=1");
    } catch (err) {
      const fromServer = serverFieldErrors(err, ["password", "confirm"] as const);
      setErrors(fromServer);
      if (!hasErrors(fromServer)) setError(errorMessage(err, "Could not delete the account"));
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Profile</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-text-muted">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-text-muted">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-text-muted">Role</dt>
          <dd>{user.role === "SUPER_ADMIN" ? "Super admin" : "Student"}</dd>
          <dt className="text-text-muted">Plan</dt>
          <dd>
            {user.accountType === "PREMIUM" ? "Premium (demo)" : "Free"}{" "}
            <Link href="/upgrade" className="text-primary hover:underline">
              {user.accountType === "PREMIUM" ? "Manage" : "Upgrade"}
            </Link>
          </dd>
        </dl>
        <p className="text-xs text-text-muted">
          Forgot your password? Log out and use &ldquo;Forgot password&rdquo; on the login page.
        </p>
      </section>

      <form onSubmit={onDelete} noValidate className="flex flex-col gap-3 rounded-card border border-red-200 bg-surface p-5">
        <h2 className="text-sm font-semibold text-red-600">Delete account</h2>
        <p className="text-sm text-text-muted">
          Permanently deletes your account and all of your subjects, tasks, study sessions, courses, lessons, quiz
          scores and XP. This cannot be undone.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            className={inputClass(errors.password)}
          />
          <FieldError message={errors.password} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type DELETE to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} className={inputClass(errors.confirm)} />
          <FieldError message={errors.confirm} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <button
            type="submit"
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </form>
    </div>
  );
}
