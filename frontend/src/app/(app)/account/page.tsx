"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PASSWORD_RULE, validatePassword } from "@shared/validation";
import { PasswordChecklist, passwordReady } from "@/lib/password";
import { accountApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";
import { errorMessage } from "@/lib/use-api";

type Field = "password" | "confirm";

// Profile summary, password change and self-service account deletion.
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
          <dt className="text-text-muted">Username</dt>
          <dd className="font-mono">@{user.username}</dd>
          <dt className="text-text-muted">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-text-muted">Role</dt>
          <dd>{user.role === "SUPER_ADMIN" ? "Super admin" : "Student"}</dd>
          <dt className="text-text-muted">Plan</dt>
          <dd>
            {user.accountType === "PREMIUM" ? "Premium (demo)" : "Free"}{" "}
            <Link href="/upgrade" className="text-primary hover:underline">
              {user.accountType === "PREMIUM" ? "Manage" : "Premium preview"}
            </Link>
          </dd>
        </dl>
      </section>

      <ChangePasswordForm />

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
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </form>
    </div>
  );
}

type PwField = "currentPassword" | "newPassword" | "confirmPassword";

// Change password. Also the step that replaces an admin-issued temporary
// password: the server clears mustChangePassword and revokes every older token,
// so the fresh token it returns is stored to keep this device signed in.
function ChangePasswordForm() {
  const { token, user, setSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<PwField>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The signed-in account: the new password must not contain these.
  const ctx = { username: user?.username, email: user?.email };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setNotice(null);
    const found: FieldErrors<PwField> = {};
    if (!currentPassword) found.currentPassword = "Enter your current password.";
    const rule = validatePassword(newPassword, ctx);
    if (rule) found.newPassword = rule;
    if (confirmPassword !== newPassword) found.confirmPassword = "The two new passwords do not match.";
    setErrors(found);
    if (hasErrors(found)) return;

    setSaving(true);
    try {
      const res = await accountApi.changePassword(token, currentPassword, newPassword);
      setSession(res.token, res.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(res.message);
    } catch (err) {
      const fromServer = serverFieldErrors(err, ["currentPassword", "newPassword"] as const);
      setErrors(fromServer);
      if (!hasErrors(fromServer)) setError(errorMessage(err, "Could not change the password"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="password" onSubmit={onSubmit} noValidate className="flex scroll-mt-24 flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Change password</h2>
      {user?.mustChangePassword ? (
        <p className="text-sm text-amber">
          You signed in with a temporary password from an administrator. Choose your own password now.
        </p>
      ) : (
        <p className="text-sm text-text-muted">{PASSWORD_RULE}</p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {user?.mustChangePassword ? "Temporary password" : "Current password"}
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          aria-invalid={!!errors.currentPassword}
          className={inputClass(errors.currentPassword)}
        />
        <FieldError message={errors.currentPassword} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={!!errors.newPassword}
          aria-describedby="new-password-rules"
          className={inputClass(errors.newPassword)}
        />
        <PasswordChecklist id="new-password-rules" password={newPassword} context={ctx} />
        <FieldError message={errors.newPassword} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={!!errors.confirmPassword}
          className={inputClass(errors.confirmPassword)}
        />
        <FieldError message={errors.confirmPassword} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-accent">{notice}</p>}
      <div>
        <button
          type="submit"
          disabled={saving || !currentPassword || !passwordReady(newPassword, ctx) || newPassword !== confirmPassword}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Change password"}
        </button>
      </div>
    </form>
  );
}
