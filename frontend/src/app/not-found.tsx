import Link from "next/link";

// Friendly 404 for any URL that is not a page (instead of the default screen).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">SQ</span>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-text-muted">That link doesn&rsquo;t lead anywhere in SchediQ. It may have moved, or the item was deleted.</p>
      <Link href="/dashboard" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
        Go to dashboard
      </Link>
    </div>
  );
}
