"use client";

import Link from "next/link";

// The three non-happy states every data view must have. Never a blank page:
// loading shows a skeleton, an error says what happened and offers Retry, and
// empty explains what goes here and links to the next action.

export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-card border border-border bg-surface">
          <div className="m-4 h-3 w-1/3 rounded bg-bg" />
          <div className="mx-4 h-2.5 w-2/3 rounded bg-bg" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
  retrying,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-red-200 bg-red-50/60 p-5">
      <div>
        <p className="text-sm font-semibold text-red-700">{title}</p>
        <p className="text-sm text-red-700/80">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="rounded-lg border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {retrying ? "Retrying..." : "Try again"}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const cls = "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90";
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-text-muted">{body}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={`mt-2 ${cls}`}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button onClick={onAction} className={`mt-2 ${cls}`}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
