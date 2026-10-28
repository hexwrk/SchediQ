"use client";

import { useState } from "react";
import { Progress } from "./api";
import { useProgress } from "./progress-context";

// Small presentational pieces reused by the dashboard, courses and reports.

export function ProgressBar({
  value,
  color = "var(--primary)",
  height = "h-2",
  label,
}: {
  value: number; // 0-100
  color?: string;
  height?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-bg`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function LevelPill({ level }: { level: string }) {
  return (
    <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted ring-1 ring-border">
      {level.toLowerCase()}
    </span>
  );
}

// After an XP-earning action: refetch the derived progress, show "+N XP" for
// the difference, and celebrate level-ups / newly unlocked badges. Returns a
// runner that wraps the action, plus the float to render.
export function useXpReward() {
  const { progress, refresh, celebrate } = useProgress();
  const [xpFloat, setXpFloat] = useState<{ id: number; amount: number } | null>(null);

  async function reward(action: () => Promise<void>) {
    const before: Progress | null = progress;
    await action();
    const after = await refresh();
    if (!before || !after) return;
    const gained = after.xp - before.xp;
    if (gained > 0) {
      const id = Date.now();
      setXpFloat({ id, amount: gained });
      setTimeout(() => setXpFloat((f) => (f?.id === id ? null : f)), 1600);
    }
    if (after.level > before.level) {
      celebrate(`Level ${after.level}: ${after.levelTitle}!`, "You leveled up. Keep the streak going.");
    }
    const had = new Set(before.badges.filter((b) => b.unlocked).map((b) => b.key));
    for (const b of after.badges) {
      if (b.unlocked && !had.has(b.key)) celebrate(`Badge unlocked: ${b.label}`, b.description);
    }
  }

  const float = xpFloat ? (
    <div
      key={xpFloat.id}
      className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-bounce rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
    >
      +{xpFloat.amount} XP
    </div>
  ) : null;

  return { reward, float };
}
