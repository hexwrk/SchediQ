"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { ProgressProvider, useProgress } from "@/lib/progress-context";
import {
  BookIcon,
  FlameIcon,
  GridIcon,
  ListIcon,
  LogoutIcon,
  PlusIcon,
  SlidersIcon,
  TrophyIcon,
} from "@/lib/icons";
import { ComponentType, SVGProps } from "react";

// Shared chrome for every authenticated page: fixed left sidebar + top bar.
// This is a client layout so it can reuse the existing token-based useAuth and
// redirect to /login when there is no session (App Router route-group layout).

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: GridIcon },
  { href: "/add-task", label: "Add task", Icon: PlusIcon },
  { href: "/tasks", label: "Task list", Icon: ListIcon },
  { href: "/subjects", label: "Subjects", Icon: BookIcon },
  { href: "/progress", label: "Progress", Icon: TrophyIcon },
  { href: "/preferences", label: "Preferences", Icon: SlidersIcon },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/add-task": "Add task",
  "/tasks": "Task list",
  "/subjects": "Subjects",
  "/progress": "Progress",
  "/preferences": "Preferences",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Gate: once auth has resolved, bounce to /login if there is no session.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user || !token) {
    // Avoid flashing the shell before we know the auth state.
    return null;
  }

  // ProgressProvider wraps the shell so both the HUD and the inner pages share
  // one derived-progress source and the same celebration surface.
  return (
    <ProgressProvider>
      <Shell pathname={pathname} userLabel={user.name ?? user.email} onLogout={logout}>
        {children}
      </Shell>
    </ProgressProvider>
  );
}

function Shell({
  pathname,
  userLabel,
  onLogout,
  children,
}: {
  pathname: string;
  userLabel: string;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const title = PAGE_TITLES[pathname] ?? "SchediQ";

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Fixed left sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            SQ
          </span>
          <span className="text-lg font-semibold tracking-tight">SchediQ</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-bg hover:text-text"
                }`}
              >
                <Icon className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={onLogout}
          className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <LogoutIcon className="shrink-0" />
          Log out
        </button>
      </aside>

      {/* Main column, offset by the sidebar width */}
      <div className="flex min-h-screen flex-1 flex-col pl-56">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-4">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-5 text-sm">
            <Hud />
            <div className="flex items-center gap-3">
              <span className="text-text-muted">{userLabel}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {userLabel.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

// Top-bar HUD: level chip, a thin XP bar, and a streak flame with the day
// count. All values are derived server-side and read from ProgressProvider.
function Hud() {
  const { progress } = useProgress();
  if (!progress) return null;
  const { levelProgress, streak } = progress;
  const pct =
    levelProgress.span > 0
      ? Math.round((levelProgress.intoLevel / levelProgress.span) * 100)
      : 0;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          Lv {progress.level}
        </span>
        <div className="hidden sm:block">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="mt-0.5 block text-[10px] text-text-muted">
            {levelProgress.intoLevel}/{levelProgress.span} XP
          </span>
        </div>
      </div>
      <div
        className="flex items-center gap-1 text-amber"
        title={`${streak}-day streak`}
      >
        <FlameIcon width={18} height={18} />
        <span className="text-sm font-semibold">{streak}</span>
      </div>
    </div>
  );
}
