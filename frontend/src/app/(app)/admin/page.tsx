"use client";

import { useEffect, useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { AccountType, AdminUser, Role, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, inputClass } from "@/lib/form";
import { SearchBox, useDebounced } from "@/lib/search";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";

// Super admin: every account, with role/tier controls, password reset and
// delete. All changes go through /api/admin/users, which the server gates with
// requireSuperAdmin.
export default function AdminUsersPage() {
  const { token, user: me } = useAuth();
  const { data, error: loadError, errorStatus, loading, reload, reloading } = useApi("admin-users", (t) => adminApi.users(t));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Server-side search: the list grows with every sign-up, so filtering runs
  // in the database (GET /api/admin/users?q=), one request per typing pause.
  const query = useDebounced(filter.trim());
  // Bumped after a mutation so an active search re-runs and drops deleted rows.
  const [searchNonce, setSearchNonce] = useState(0);
  const [search, setSearch] = useState<{ query: string; nonce: number; users: AdminUser[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!token || !query) return;
    let active = true;
    adminApi.users(token, query).then(
      (r) => active && setSearch({ query, nonce: searchNonce, users: r.users, error: null }),
      (err) => active && setSearch({ query, nonce: searchNonce, users: [], error: errorMessage(err, "Search failed") })
    );
    return () => {
      active = false;
    };
  }, [token, query, searchNonce]);

  const total = data?.total ?? 0;
  const searching = !!query && (!search || search.query !== query || search.nonce !== searchNonce);
  // While a new search is in flight, keep showing the previous rows (no flash).
  const users: AdminUser[] = query ? (search?.users ?? []) : (data?.users ?? []);
  const searchError = query && search?.query === query ? search.error : null;
  // Delete confirmation: the admin must type the account's email exactly.
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Password reset: confirm first, then show the temporary password ONCE. It
  // only lives in this component state and is dropped when the dialog closes.
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setSearchNonce((n) => n + 1);
    await reload();
  }

  async function confirmReset() {
    if (!token || !resetting) return;
    setResetBusy(true);
    setResetError(null);
    try {
      const res = await adminApi.resetPassword(token, resetting.id);
      setIssued(res);
      setCopied(false);
      setNotice(`Temporary password issued for ${res.email}.`);
      await load();
    } catch (err) {
      setResetError(errorMessage(err, "Password reset failed"));
    } finally {
      setResetBusy(false);
    }
  }

  function closeReset() {
    setResetting(null);
    setIssued(null);
    setResetError(null);
    setCopied(false);
  }

  async function copyIssued() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (permissions, non-HTTPS); the password is
      // still selectable on screen.
      setResetError("Could not copy automatically. Select the password and copy it manually.");
    }
  }

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

  const shown = users;

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {total} accounts. Role and tier changes apply immediately (the role is checked on every request).
        </p>
        <div className="flex items-center gap-2">
          <SearchBox
            value={filter}
            onChange={setFilter}
            placeholder="Search name, email or username"
            label="Search users"
            // Only once the server has answered for exactly what is typed.
            shown={searching || filter.trim() !== query ? undefined : shown.length}
            total={total}
          />
          {(searching || filter.trim() !== query) && <span className="text-xs text-text-muted">Searching...</span>}
        </div>
      </div>
      {searchError && <p className="text-sm text-red-600">{searchError}</p>}
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
            {shown.length === 0 && !searching && (
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
                    <span className="block text-xs text-text-muted">
                      {u.email} {u.username && <span className="font-mono">@{u.username}</span>}
                    </span>
                    {u.mustChangePassword && (
                      <span className="mt-1 block text-[11px] font-medium text-amber">Temporary password not yet changed</span>
                    )}
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
                      <span className="flex justify-end gap-3 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setResetting(u);
                            setIssued(null);
                            setResetError(null);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Reset password
                        </button>
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
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal aria-labelledby="reset-title">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-card border border-border bg-surface p-6">
            <h2 id="reset-title" className="text-lg font-semibold">
              {issued ? "Temporary password" : "Reset password?"}
            </h2>
            {issued ? (
              <>
                <p className="text-sm text-text-muted">
                  Give this to <span className="font-medium text-text">{issued.email}</span> privately (in person or a
                  direct message). It is shown <span className="font-medium text-text">only once</span>. They will be asked
                  to choose a new password after logging in.
                </p>
                <code className="select-all break-all rounded-lg border border-input bg-bg px-3 py-2 text-center font-mono text-base tracking-wide">
                  {issued.temporaryPassword}
                </code>
                {resetError && <p className="text-sm text-red-600">{resetError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={copyIssued} className="rounded-lg border border-border px-4 py-2 text-sm">
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={closeReset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90">
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  Replaces the password of <span className="font-medium text-text">{resetting.email}</span> with a new
                  temporary one. Their current password and any reset links stop working immediately.
                </p>
                {resetError && <p className="text-sm text-red-600">{resetError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={closeReset} className="rounded-lg border border-border px-4 py-2 text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={confirmReset}
                    disabled={resetBusy}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
                  >
                    {resetBusy ? "Resetting..." : "Issue temporary password"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal>
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
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90"
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
