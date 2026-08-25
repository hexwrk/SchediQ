"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading, logout } = useAuth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        SchediQ
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Turn your free-text workload into a daily-limit-aware study schedule.
      </p>

      {loading ? null : user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
          <div className="flex gap-3">
            <Link
              href="/tasks"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
            >
              Go to tasks
            </Link>
            <button
              onClick={logout}
              className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium dark:border-white/15"
            >
              Log out
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium dark:border-white/15"
          >
            Sign up
          </Link>
        </div>
      )}
    </div>
  );
}
