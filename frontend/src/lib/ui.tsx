"use client";

import { useState } from "react";
import { Progress, Task } from "./api";
import { useProgress } from "./progress-context";

// Small presentational pieces reused by the dashboard, courses and reports.

export function ProgressBar({
  value,
  color = "var(--primary)",
  subjectColor,
  muted = false,
  height = "h-2",
  label,
}: {
  value: number; // 0-100
  color?: string;
  // A subject's raw colour tag: rendered through .subject-fill (globals.css),
  // which adjusts it per theme so the bar keeps >= 4.5:1 against its track.
  subjectColor?: string | null;
  // Finished work: full bar in the muted text colour ("greyed").
  muted?: boolean;
  height?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fillStyle: React.CSSProperties = muted
    ? { width: `${pct}%`, background: "var(--text-muted)" }
    : subjectColor
      ? ({ width: `${pct}%`, "--fill": subjectColor } as React.CSSProperties)
      : { width: `${pct}%`, background: color };
  return (
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${subjectColor && !muted ? "subject-fill" : ""}`}
        style={fillStyle}
      />
    </div>
  );
}

// One task's progress: a bar in the subject's colour plus a plain-language
// label. All numbers come from task.progress (derived server-side from the
// task's study sessions), so the list, the dashboard and a reload agree.
export function TaskProgressLine({ task }: { task: Task }) {
  const p = task.progress;
  const done = task.status === "DONE";
  const next = p.nextSessionAt
    ? new Date(p.nextSessionAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  let label: string;
  if (done) {
    label =
      p.sessionsTotal > 0 && p.sessionsDone < p.sessionsTotal
        ? `Marked done · ${p.sessionsDone} of ${p.sessionsTotal} sessions were completed`
        : `Done · ${p.completedMin} min studied`;
  } else if (p.sessionsTotal === 0) {
    label = `Not scheduled yet · ${p.totalMin} min to plan. Regenerate your schedule.`;
  } else {
    label = `${p.sessionsDone} of ${p.sessionsTotal} sessions done · ${p.completedMin} / ${p.totalMin} min (${p.percent}%)${
      next ? ` · next ${next}` : ""
    }`;
  }

  return (
    <div className="flex flex-col gap-1">
      <ProgressBar
        value={done ? 100 : p.percent}
        muted={done}
        subjectColor={task.subject?.colorTag ?? "#6366F1"}
        height="h-1.5"
        label={`${task.title}: ${done ? "done" : `${p.percent}% complete`}`}
      />
      <span className="text-xs text-text-muted">{label}</span>
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
      className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-bounce rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-solid shadow-lg"
    >
      +{xpFloat.amount} XP
    </div>
  ) : null;

  return { reward, float };
}
