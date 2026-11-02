"use client";

import { useAuth } from "@/lib/auth-context";
import { StarIcon } from "@/lib/icons";

// Premium preview. During the demo every feature is free with no limits
// (TIER_LIMITS_ENABLED = false in shared/validation.ts), so this page only
// describes what a future Premium plan might add. There is no tier switch and
// no payment; see docs/ROADMAP.md.

const INCLUDED = [
  "Tasks, subjects and the study scheduler",
  "Unlimited AI task parsing",
  "Unlimited AI-generated courses with quizzes",
  "Progress, XP, streaks and badges",
  "Reports with PDF and CSV export",
];

// Planned, not built. Keep in step with docs/ROADMAP.md.
const PLANNED = [
  "A paid monthly plan with real billing",
  "Higher AI parsing and course-generation allowances once Free plan limits return",
  "Priority access to new features as they ship",
];

export default function UpgradePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div role="status" className="rounded-card border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
        <span className="font-semibold">All features are currently free during the demo.</span> There are no
        limits on any account, and nothing is charged.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Free</h2>
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
              Current plan
            </span>
          </div>
          <p className="text-2xl font-semibold tracking-tight">R0</p>
          <ul className="flex flex-col gap-1 text-sm text-text-muted">
            {INCLUDED.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-dashed border-violet/50 bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-violet">
              <StarIcon width={16} height={16} />
              Premium
            </h2>
            <span className="rounded-full bg-violet/10 px-2.5 py-0.5 text-xs font-semibold text-violet">
              Not yet available
            </span>
          </div>
          <p className="text-2xl font-semibold tracking-tight">Coming in a future update</p>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Planned (subject to change)</p>
          <ul className="flex flex-col gap-1 text-sm text-text-muted">
            {PLANNED.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
