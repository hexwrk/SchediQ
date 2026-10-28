"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ReportIcon } from "@/lib/icons";

const REPORTS = [
  { href: "/reports/schedule", title: "Study schedule", desc: "Your upcoming study sessions by day and time." },
  { href: "/reports/workload", title: "Workload summary", desc: "Tasks grouped by subject and priority, with total hours." },
  { href: "/reports/progress", title: "Progress report", desc: "Completion rate, XP, streak, mastery and per-subject completion." },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const list =
    user?.role === "SUPER_ADMIN"
      ? [...REPORTS, { href: "/reports/admin", title: "Admin system report", desc: "Users by role and tier, and system totals." }]
      : REPORTS;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-text-muted">
        Each report is a printable page (Print / Save as PDF) with a CSV download of the same data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-start gap-3 rounded-card border border-border bg-surface p-5 hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ReportIcon width={20} height={20} />
            </span>
            <span>
              <span className="block font-medium">{r.title}</span>
              <span className="text-sm text-text-muted">{r.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
