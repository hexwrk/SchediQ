"use client";

import Link from "next/link";
import { ShieldIcon } from "./icons";

// Shown when a non-admin reaches an admin page (or an admin API returns 403).
export function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <ShieldIcon width={24} height={24} />
      </span>
      <h2 className="text-lg font-semibold">Access denied</h2>
      <p className="text-sm text-text-muted">
        This area is for super administrators only. Your account does not have the required role,
        and the server refuses these requests (HTTP 403) regardless of what the browser shows.
      </p>
      <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90">
        Back to dashboard
      </Link>
    </div>
  );
}
