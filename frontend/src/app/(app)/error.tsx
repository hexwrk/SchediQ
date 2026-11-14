"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

// Catches any unexpected render error inside the signed-in app. The sidebar and
// top bar (the (app) layout) stay usable; only the page area shows this.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Logged for debugging; the user sees a friendly message, not a stack trace.
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong on this page</h2>
      <p className="text-sm text-text-muted">
        An unexpected error stopped this page from loading. Your data is safe. Try again, or go back to the
        dashboard.
      </p>
      {error.digest && <p className="text-xs text-text-muted">Reference: {error.digest}</p>}
      <div className="flex gap-2">
        <button onClick={() => retry()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90">
          Try again
        </button>
        <Link href="/dashboard" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
