"use client";

import { useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { AccountType, AdminUser, Role, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, inputClass } from "@/lib/form";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";

// Super admin: every account, with role/tier controls and delete. All changes
// go through /api/admin/users, which the server gates with requireSuperAdmin.
export default function AdminUsersPage() {
  const { token, user: me } = useAuth();
  const { data, error: loadError, errorStatus, loading, reload, reloading } = useApi("admin-users", (t) =>
    adminApi.users(t).then((r) => r.users)
  );
  const users: AdminUser[] = data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Delete confirmation: the admin must type the account's email exactly.
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = reload;

  async function update(u: AdminUser, data: { role?: Role; accountType?: AccountType }) {
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateUser(token, u.id, data);
      setNotice(`Updated ${u.email}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Update failed"));
    }
  }

  async function confirmDelete() {
    if (!token || !deleting) return;
    if (confirmText.trim().toLowerCase() !== deleting.email.toLowerCase()) {
      setConfirmError("Type the account's email exactly to confirm.");
      return;
    }
    try {
      await adminApi.deleteUser(token, deleting.id);
      setNotice(`Deleted ${deleting.email} and all of their data.`);
      setDeleting(null);
      setConfirmText("");
      setConfirmError(null);
      await load();
    } catch (err) {
      setConfirmError(errorMessage(err, "Delete failed"));
    }
  }

  if (errorStatus === 403) return <AccessDenied />;
  if (loading) return <LoadingState label="Loading users" />;
  if (loadError && !data) return <ErrorState message={loadError} onRetry={reload} retrying={reloading} />;

  const q = filter.trim().toLowerCase();
  const shown = q ? users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)) : users;

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {users.length} accounts. Role and tier changes apply immediately (the role is checked on every request).
        </p>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email"
          className={inputClass(null, "w-64 text-sm")}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-accent">{notice}</p>}

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Tier</th>
              <th className="px-4 py-2 text-right font-medium">Subjects</th>
              <th className="px-4 py-2 text-right font-medium">Tasks</th>
              <th className="px-4 py-2 text-right font-medium">Sessions</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4">
                  <EmptyState title="No matching accounts" body={`Nothing matches "${filter}". Clear the filter to see everyone.`} onAction={() => setFilter("")} actionLabel="Clear filter" />
                </td>
              </tr>
            )}
            {shown.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span className="block font-medium">
                      {u.name} {self && <span className="text-xs text-text-muted">(you)</span>}
                    </span>
                    <span className="text-xs text-text-muted">{u.email}</span>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      disabled={self}
                      title={self ? "You cannot change your own role" : undefined}
                      onChange={(e) => update(u, { role: e.target.value as Role })}
                      className={inputClass(null, "py-1 text-xs")}
                    >
                      <option value="USER">User</option>
                      <option value="SUPER_ADMIN">Super admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.accountType}
                      onChange={(e) => update(u, { accountType: e.target.value as AccountType })}
                      className={inputClass(null, "py-1 text-xs")}
                    >
                      <option value="FREE">Free</option>
                      <option value="PREMIUM">Premium</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">{u.subjectCount}</td>
                  <td className="px-4 py-2 text-right">{u.taskCount}</td>
                  <td className="px-4 py-2 text-right">{u.sessionCount}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    {!self && (
                      <button
                        onClick={() => {
                          setDeleting(u);
                          setConfirmText("");
                          setConfirmError(null);
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal>
          <div className="flex w-full max-w-md flex-col gap-3 rounded-card border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-red-600">Delete account?</h2>
            <p className="text-sm text-text-muted">
              This permanently deletes <span className="font-medium text-text">{deleting.email}</span> and all of
              their subjects, tasks, sessions and courses. It cannot be undone (except by restoring a backup).
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Type the email to confirm
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                aria-invalid={!!confirmError}
                className={inputClass(confirmError)}
              />
              <FieldError message={confirmError} />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-lg border border-border px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
