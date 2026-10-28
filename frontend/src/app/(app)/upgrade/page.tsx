"use client";

import { useEffect, useState } from "react";
import { FREE_AI_PARSES_PER_DAY, FREE_COURSE_LIMIT } from "@shared/validation";
import { AccountType, ApiError, Usage, accountApi, coursesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { StarIcon } from "@/lib/icons";

// Free vs Premium comparison with a DEMO upgrade button. There is no payment:
// the button flips the account tier via PATCH /api/account/tier so the gated
// features can be demonstrated. The copy says so plainly.

const ROWS: { feature: string; free: string; premium: string }[] = [
  { feature: "Tasks, subjects and the study scheduler", free: "Unlimited", premium: "Unlimited" },
  { feature: "Progress, XP, streaks and badges", free: "Included", premium: "Included" },
  { feature: "AI task parsing", free: `${FREE_AI_PARSES_PER_DAY} per day`, premium: "Unlimited" },
  { feature: "Generated courses", free: `${FREE_COURSE_LIMIT} in total`, premium: "Unlimited" },
  { feature: "Reports (print / CSV)", free: "Included", premium: "Included" },
];

export default function UpgradePage() {
  const { token, user, setUser } = useAuth();
  const [parses, setParses] = useState<Usage | null>(null);
  const [courses, setCourses] = useState<Usage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([accountApi.get(token), coursesApi.list(token)])
      .then(([a, c]) => {
        setParses(a.usage.aiParses);
        setCourses(c.usage);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your plan"));
  }, [token]);

  async function switchTo(tier: AccountType) {
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await accountApi.setTier(token, tier);
      setUser(res.user);
      setParses(res.usage.aiParses);
      const c = await coursesApi.list(token);
      setCourses(c.usage);
      setMessage(tier === "PREMIUM" ? "You're on Premium (demo). Limits are lifted." : "Switched back to the Free plan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change plan");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  const premium = user.accountType === "PREMIUM";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="rounded-card border border-amber/40 bg-amber/5 px-4 py-3 text-sm">
        <span className="font-semibold">Demo tier, not real billing.</span> SchediQ has no payment
        system. The button below just switches your account between Free and Premium so the
        difference can be shown. Nothing is charged.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="R0"
          current={!premium}
          lines={[`${FREE_AI_PARSES_PER_DAY} AI parses per day`, `${FREE_COURSE_LIMIT} generated courses`, "Full scheduler and progress"]}
        />
        <PlanCard
          name="Premium"
          price="Demo"
          current={premium}
          highlight
          lines={["Unlimited AI parsing", "Unlimited generated courses", "Everything in Free"]}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">Free</th>
              <th className="px-4 py-2 font-medium">Premium</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.feature} className="border-t border-border">
                <td className="px-4 py-2">{r.feature}</td>
                <td className="px-4 py-2 text-text-muted">{r.free}</td>
                <td className="px-4 py-2 font-medium text-violet">{r.premium}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Your usage</h2>
        <p className="text-sm text-text-muted">
          AI parses today:{" "}
          <span className="font-medium text-text">
            {parses ? (parses.limit === null ? `${parses.used} (unlimited)` : `${parses.used} / ${parses.limit}`) : "..."}
          </span>
          {" · "}Courses:{" "}
          <span className="font-medium text-text">
            {courses ? (courses.limit === null ? `${courses.used} (unlimited)` : `${courses.used} / ${courses.limit}`) : "..."}
          </span>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-accent">{message}</p>}
        <div>
          {premium ? (
            <button
              onClick={() => switchTo("FREE")}
              disabled={saving}
              className="rounded-lg border border-border px-5 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
            >
              {saving ? "Switching..." : "Switch back to Free"}
            </button>
          ) : (
            <button
              onClick={() => switchTo("PREMIUM")}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-violet px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <StarIcon width={16} height={16} />
              {saving ? "Upgrading..." : "Upgrade to Premium (demo, no payment)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  lines,
  current,
  highlight,
}: {
  name: string;
  price: string;
  lines: string[];
  current: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-card border bg-surface p-5 ${
        highlight ? "border-violet/50" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-semibold ${highlight ? "text-violet" : ""}`}>{name}</h2>
        {current && (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
            Current plan
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight">{price}</p>
      <ul className="flex flex-col gap-1 text-sm text-text-muted">
        {lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
    </div>
  );
}
