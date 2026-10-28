"use client";

import Link from "next/link";
import { useState } from "react";
import { Overview } from "@/lib/api";
import { CapIcon, FlameIcon } from "@/lib/icons";
import { ProgressBar } from "@/lib/ui";

// The "progress home" block at the top of the Dashboard. Pure presentation:
// every number comes from GET /api/progress/overview, which derives it from the
// database, so it is identical after a reload.

export default function ProgressHome({ overview }: { overview: Overview }) {
  const { week, mastery, courses, trend, masteryWeights } = overview;
  const active = courses.filter((c) => !c.completed);
  const shownCourses = (active.length ? active : courses).slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      {/* This week */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Studied this week" value={`${(week.studyMinutes / 60).toFixed(1)}h`} accent="var(--primary)" />
        <Stat label="Lessons this week" value={String(week.lessonsCompleted)} accent="var(--accent)" />
        <Stat label="Quizzes passed" value={String(week.quizzesPassed)} accent="var(--violet)" />
        <Stat
          label="Current streak"
          value={`${week.streak} ${week.streak === 1 ? "day" : "days"}`}
          accent="var(--amber)"
          icon={<FlameIcon width={16} height={16} className="text-amber" />}
        />
        <Stat
          label="Level"
          value={`${week.level} · ${week.levelTitle}`}
          accent="var(--primary)"
          sub={`${week.xp} XP total · +${week.xpEarned} this week`}
        />
      </div>

      {/* items-start: each card keeps its own height instead of stretching to
          the tallest one (which left a large empty block on wide screens). */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Subject mastery */}
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Subject mastery</h2>
            <span
              className="cursor-help text-xs text-text-muted underline decoration-dotted"
              title={`Mastery = lessons completed (${masteryWeights.lessons}%) + quiz scores (${masteryWeights.quizzes}%) + study time vs planned (${masteryWeights.study}%), over the parts that apply to the subject.`}
            >
              How is this scored?
            </span>
          </div>
          {mastery.length === 0 ? (
            <p className="text-sm text-text-muted">
              Add a subject to start tracking mastery. <Link href="/subjects" className="text-primary hover:underline">Subjects</Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {mastery.map((m) => (
                <li key={m.subjectId} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.colorTag }} />
                      {m.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {m.changeThisWeek !== 0 && (
                        <span className={`text-xs font-medium ${m.changeThisWeek > 0 ? "text-accent" : "text-red-600"}`}>
                          {m.changeThisWeek > 0 ? "▲" : "▼"} {Math.abs(m.changeThisWeek)} this week
                        </span>
                      )}
                      <span className="w-10 text-right font-semibold">{m.mastery}%</span>
                    </span>
                  </div>
                  <ProgressBar value={m.mastery} subjectColor={m.colorTag} label={`${m.name} mastery`} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Active courses */}
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{active.length ? "Active courses" : "Courses"}</h2>
              <Link href="/courses" className="text-xs text-primary hover:underline">
                {courses.length ? "All courses" : "Generate a course"}
              </Link>
            </div>
            {shownCourses.length === 0 ? (
              <p className="text-sm text-text-muted">
                No courses yet. Generate one for a weak subject to raise its mastery.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {shownCourses.map((c) => {
                  const pct = c.lessonsTotal ? (100 * c.lessonsDone) / c.lessonsTotal : 0;
                  return (
                    <li key={c.id}>
                      <Link href={`/courses/${c.id}`} className="group flex flex-col gap-1.5">
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <CapIcon width={16} height={16} className="shrink-0 text-primary" />
                            <span className="truncate font-medium group-hover:text-primary">{c.title}</span>
                          </span>
                          <span className="shrink-0 text-xs text-text-muted">
                            {c.lessonsDone}/{c.lessonsTotal}
                          </span>
                        </span>
                        <ProgressBar
                          value={pct}
                          color="var(--accent)"
                          subjectColor={c.completed ? null : c.subject?.colorTag ?? "#6366F1"}
                          label={`${c.title} progress`}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Trend trend={trend} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  sub,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon ?? <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

// 14-day bar chart. Bars are HTML flex items with percentage heights inside a
// fixed-height box, so the chart keeps the same proportions and label size at
// every screen width (an SVG viewBox would scale its text up on wide screens).
function Trend({ trend }: { trend: Overview["trend"] }) {
  const [metric, setMetric] = useState<"xp" | "studyMinutes">("xp");
  const values = trend.map((t) => t[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const unit = metric === "xp" ? "XP" : "min";

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Last 14 days</h2>
        <div className="flex rounded-lg bg-bg p-0.5 text-xs">
          {(["xp", "studyMinutes"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-2 py-1 ${metric === m ? "bg-surface font-semibold text-text shadow-sm" : "text-text-muted"}`}
            >
              {m === "xp" ? "XP" : "Study minutes"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex h-24 items-end gap-1 border-b border-border"
        role="img"
        aria-label={`${unit} per day over the last 14 days, ${total} in total`}
      >
        {trend.map((t, i) => {
          const v = t[metric];
          const isToday = i === trend.length - 1;
          return (
            <div
              key={t.date}
              title={`${t.date}: ${v} ${unit}`}
              className={`flex-1 rounded-t-sm ${isToday ? "bg-accent" : "bg-primary/75"}`}
              style={{ height: v === 0 ? 0 : `${Math.max(4, (v / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-muted">
        <span>{trend[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {total} {unit} over 14 days
      </p>
    </div>
  );
}
