"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Authenticated users go straight to their dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || user) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">
        SQ
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">SchediQ</h1>
      <p className="max-w-md text-text-muted">
        Turn your free-text workload into a daily-limit-aware study schedule that
        clusters similar subjects to cut task-switching cost.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium hover:bg-bg"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
