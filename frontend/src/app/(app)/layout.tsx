"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ProgressProvider, useProgress } from "@/lib/progress-context";
import {
  BookIcon,
  CapIcon,
  CloseIcon,
  MenuIcon,
  UserIcon,
  DatabaseIcon,
  FlameIcon,
  GridIcon,
  LinkIcon,
  ListIcon,
  LogoutIcon,
  PlusIcon,
  ReportIcon,
  SlidersIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from "@/lib/icons";
import { AuthUser } from "@/lib/api";
import { ThemeToggle } from "@/lib/theme-toggle";
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
  { href: "/courses", label: "Courses", Icon: CapIcon },
  { href: "/progress", label: "Progress", Icon: TrophyIcon },
  { href: "/reports", label: "Reports", Icon: ReportIcon },
  { href: "/preferences", label: "Preferences", Icon: SlidersIcon },
  { href: "/upgrade", label: "Upgrade", Icon: StarIcon },
  { href: "/account", label: "Account", Icon: UserIcon },
];

// Rendered ONLY for SUPER_ADMIN. Hiding them is UX, not security: every
// /api/admin route is independently gated server-side by requireSuperAdmin.
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Users", Icon: UsersIcon },
  { href: "/admin/system", label: "System & backup", Icon: DatabaseIcon },
  { href: "/admin/data-model", label: "Data model", Icon: LinkIcon },
];

// Longest-prefix match so nested routes (/courses/[id]) get their section title.
const PAGE_TITLES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/add-task", "Add task"],
  ["/tasks", "Task list"],
  ["/subjects", "Subjects"],
  ["/courses", "Courses"],
  ["/progress", "Progress"],
  ["/reports", "Reports"],
  ["/preferences", "Preferences"],
  ["/upgrade", "Upgrade"],
  ["/account", "Account"],
  ["/admin/system", "System & backup"],
  ["/admin/data-model", "Data model"],
  ["/admin", "Admin: users"],
];

function titleFor(pathname: string): string {
  const hit = PAGE_TITLES.filter(([p]) => pathname === p || pathname.startsWith(`${p}/`)).sort(
    (a, b) => b[0].length - a[0].length
  )[0];
  return hit?.[1] ?? "SchediQ";
}

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
      <Shell pathname={pathname} user={user} onLogout={logout}>
        {children}
      </Shell>
    </ProgressProvider>
  );
}

function NavLink({ href, label, Icon, active, onNavigate }: NavItem & { active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg hover:text-text"
      }`}
    >
      <Icon className="shrink-0" />
      {label}
    </Link>
  );
}

function Shell({
  pathname,
  user,
  onLogout,
  children,
}: {
  pathname: string;
  user: AuthUser;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const title = titleFor(pathname);
  const userLabel = user.name || user.email;
  const isAdmin = user.role === "SUPER_ADMIN";
  // Active = exact match or a nested route, except /admin which would otherwise
  // light up for every admin sub-page.
  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  // Below lg the sidebar is an off-canvas drawer opened from the top bar.
  // Closing happens in the link's click handler (not an effect on pathname).
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {menuOpen && (
        <button
          aria-label="Close menu"
          onClick={close}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden print:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:w-56 lg:translate-x-0 print:hidden ${
          menuOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <span className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-solid">
              SQ
            </span>
            <span className="text-lg font-semibold tracking-tight">SchediQ</span>
          </span>
          <button onClick={close} aria-label="Close menu" className="rounded-lg p-1 text-text-muted hover:bg-bg lg:hidden">
            <CloseIcon />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} onNavigate={close} />
          ))}
          {isAdmin && (
            <>
              <span className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Super admin
              </span>
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onNavigate={close} />
              ))}
            </>
          )}
        </nav>

        <button
          onClick={onLogout}
          className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <LogoutIcon className="shrink-0" />
          Log out
        </button>
      </aside>

      {/* Main column, offset by the sidebar width on large screens only */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-56 print:pl-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3 sm:px-8 sm:py-4 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
              className="rounded-lg p-1.5 text-text hover:bg-bg lg:hidden"
            >
              <MenuIcon />
            </button>
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm sm:gap-5">
            <Hud />
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <TierBadge user={user} />
              <span className="hidden text-text-muted md:inline">{userLabel}</span>
              <Link
                href="/account"
                title="Account"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {userLabel.slice(0, 1).toUpperCase()}
              </Link>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8 print:p-0">
          {user.mustChangePassword && (
            <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber/40 bg-amber/5 px-4 py-3 text-sm print:hidden">
              <span>
                <span className="font-semibold">You are using a temporary password.</span> Choose your own to secure
                your account.
              </span>
              <Link href="/account#password" className="font-medium text-primary hover:underline">
                Change password
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

// Tier badge: links to /upgrade so the plan is always one click from the UI.
function TierBadge({ user }: { user: AuthUser }) {
  const premium = user.accountType === "PREMIUM";
  return (
    <span className="flex items-center gap-1.5">
      {user.role === "SUPER_ADMIN" && (
        <span className="rounded-full bg-text px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-solid">
          Admin
        </span>
      )}
      <Link
        href="/upgrade"
        title={premium ? "Premium plan (demo tier)" : "Free plan: click to see Premium"}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          premium ? "bg-violet text-on-solid" : "bg-bg text-text-muted ring-1 ring-border"
        }`}
      >
        {premium ? "Premium" : "Free"}
      </Link>
    </span>
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
        <span
          className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
          title={progress.levelTitle}
        >
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
