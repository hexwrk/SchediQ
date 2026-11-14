"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Overview,
  Preference,
  ScheduleIssue,
  StudySession,
  Task,
  preferencesApi,
  progressApi,
  sessionsApi,
  tasksApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RefreshIcon } from "@/lib/icons";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { TaskProgressLine, useXpReward } from "@/lib/ui";
import { errorMessage, useApi } from "@/lib/use-api";
import ProgressHome from "./ProgressHome";

const WEEK_DAYS = 7;

function minutesOf(s: StudySession): number {
  return (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000;
}

// Local calendar-day key (YYYY-MM-DD in local time) so blocks land on the day
// the scheduler intended; the scheduler builds instants in server-local time
// and the user's browser is the same zone (UTC+2).
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// The 7 local days starting today. Built from date parts (not ms offsets) so a
// DST change can never shift a column.
function weekFrom(today: Date): Date[] {
  return Array.from(
    { length: WEEK_DAYS },
    (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
  );
}

interface DashboardData {
  sessions: StudySession[];
  issues: ScheduleIssue[];
  prefs: Preference;
  overview: Overview;
  tasks: Task[];
  // Captured when the data loaded, so render stays pure (no Date() in render).
  loadedAt: number;
}

async function loadDashboard(token: string): Promise<DashboardData> {
  const [s, p, o, t] = await Promise.all([
    sessionsApi.list(token),
    preferencesApi.get(token),
    progressApi.overview(token),
    tasksApi.list(token),
  ]);
  return { sessions: s.sessions, issues: s.issues, prefs: p.preferences, overview: o, tasks: t.tasks, loadedAt: Date.now() };
}

export default function DashboardPage() {
  const { token } = useAuth();
  const { data, error, loading, reload, reloading } = useApi("dashboard", loadDashboard);
  const { reward, float } = useXpReward();
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function regenerate() {
    if (!token) return;
    setRegenerating(true);
    setActionError(null);
    try {
      await sessionsApi.generate(token);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err, "Failed to regenerate"));
    } finally {
      setRegenerating(false);
    }
  }

  // Toggle a study block complete/incomplete. Completion lives on the session;
  // XP is then re-derived server-side, and useXpReward shows the "+N XP" float
  // and any level-up / badge celebration.
  async function toggleBlock(s: StudySession) {
    if (!token) return;
    setActionError(null);
    try {
      await reward(async () => {
        await sessionsApi.toggle(token, s.id, s.completedAt === null);
      });
      await reload();
    } catch (err) {
      setActionError(errorMessage(err, "Failed to update session"));
    }
  }

  if (loading) return <LoadingState label="Loading dashboard" rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} retrying={reloading} />;
  if (!data) return null;

  const { sessions, issues, prefs, overview, tasks, loadedAt } = data;
  // Started but not finished: front and centre so progress is visible.
  const inProgress = tasks
    .filter((t) => t.status !== "DONE" && t.progress.percent > 0 && t.progress.percent < 100)
    .sort((a, b) => b.progress.percent - a.progress.percent);
  const { counts } = overview;
  const today = new Date(loadedAt);
  const days = weekFrom(today);
  const windowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WEEK_DAYS).getTime();

  const byDay = new Map<string, StudySession[]>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const weekSessions = sessions.filter(
    (s) => new Date(s.startsAt).getTime() >= days[0].getTime() && new Date(s.startsAt).getTime() < windowEnd
  );

  // First run: anything not yet set up gets a guided checklist instead of empty widgets.
  const steps: Step[] = [
    { done: counts.subjects > 0, label: "Add a subject", body: "Subjects group your work and drive mastery.", href: "/subjects", cta: "Add subject" },
    {
      done: counts.tasks > 0 || counts.courses > 0,
      label: "Add tasks or generate a course",
      body: "Type a task in plain English, or generate a course to learn a topic.",
      href: "/add-task",
      cta: "Add a task",
      alt: { href: "/courses", label: "Generate a course" },
    },
    {
      done: counts.sessions > 0,
      label: "Generate your schedule",
      body: "The planner places your tasks inside your study window and daily limit.",
      onClick: regenerate,
      cta: regenerating ? "Generating..." : "Generate schedule",
    },
  ];
  const onboarding = steps.some((s) => !s.done);
  const hasProgress = counts.subjects > 0 || counts.courses > 0 || overview.week.xp > 0;

  return (
    <div className="relative flex flex-col gap-6">
      {float}

      {onboarding && <Onboarding steps={steps} />}

      {hasProgress && <ProgressHome overview={overview} />}

      {inProgress.length > 0 && <InProgressPanel tasks={inProgress} />}

      {issues.length > 0 && <IssuesPanel issues={issues} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold">This week&rsquo;s schedule</h2>
          <p className="text-sm text-text-muted">Click a block to mark it complete and earn XP.</p>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshIcon width={16} height={16} />
          {regenerating ? "Regenerating..." : "Regenerate schedule"}
        </button>
      </div>

      {actionError && <ErrorState title="That didn't work" message={actionError} />}
      {error && <ErrorState title="Showing the last loaded data" message={error} onRetry={reload} retrying={reloading} />}

      {weekSessions.length === 0 ? (
        <EmptyState
          title="No study blocks this week"
          body={
            counts.tasks === 0
              ? "Add a task first, then generate a schedule to fill your week."
              : "Generate your schedule to place your tasks into study blocks."
          }
          actionLabel={counts.tasks === 0 ? "Add a task" : regenerating ? "Generating..." : "Generate schedule"}
          actionHref={counts.tasks === 0 ? "/add-task" : undefined}
          onAction={counts.tasks === 0 ? undefined : regenerate}
        />
      ) : (
        <WeekCalendar days={days} byDay={byDay} maxDaily={prefs.maxDailyMins} onToggle={toggleBlock} />
      )}
    </div>
  );
}

// Tasks with some but not all study sessions completed. Same card language as
// "Active courses" on the progress home, so task and course progress read alike.
function InProgressPanel({ tasks }: { tasks: Task[] }) {
  const shown = tasks.slice(0, 6);
  return (
    <section className="rounded-card border border-border bg-surface p-5" aria-labelledby="in-progress-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="in-progress-heading" className="text-sm font-semibold">
          In progress ({tasks.length})
        </h2>
        <Link href="/tasks" className="text-xs text-primary hover:underline">
          {tasks.length > shown.length ? `All ${tasks.length} in Task list` : "Task list"}
        </Link>
      </div>
      <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {shown.map((t) => (
          <li key={t.id} className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.subject?.colorTag ?? "#6366F1" }} />
              <span className="truncate font-medium">{t.title}</span>
              <span className="ml-auto shrink-0 text-xs font-semibold">{t.progress.percent}%</span>
            </span>
            <TaskProgressLine task={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface Step {
  done: boolean;
  label: string;
  body: string;
  cta: string;
  href?: string;
  onClick?: () => void;
  alt?: { href: string; label: string };
}

function Onboarding({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section className="rounded-card border border-primary/30 bg-primary/5 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Welcome to SchediQ: let&rsquo;s set up your week</h2>
          <p className="text-sm text-text-muted">Three steps and your dashboard fills with your plan and progress.</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-primary">
          {doneCount}/{steps.length} done
        </span>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`flex flex-col gap-2 rounded-lg border bg-surface p-4 ${s.done ? "border-accent/40" : "border-border"}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  s.done ? "bg-accent text-on-solid" : "bg-bg text-text-muted ring-1 ring-border"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              {s.label}
            </span>
            <span className="text-xs text-text-muted">{s.body}</span>
            {!s.done && (
              <span className="mt-auto flex flex-wrap gap-2 pt-1">
                {s.href ? (
                  <Link href={s.href} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-solid hover:opacity-90">
                    {s.cta}
                  </Link>
                ) : (
                  <button onClick={s.onClick} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-solid hover:opacity-90">
                    {s.cta}
                  </button>
                )}
                {s.alt && (
                  <Link href={s.alt.href} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg">
                    {s.alt.label}
                  </Link>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const ISSUE_STYLE: Record<ScheduleIssue["kind"], { label: string; cls: string }> = {
  OVERDUE: { label: "Overdue", cls: "bg-red-100 text-red-700" },
  AT_RISK: { label: "At risk", cls: "bg-amber/15 text-amber" },
  UNSCHEDULED: { label: "Not scheduled", cls: "bg-violet/15 text-violet" },
};

// Tasks the scheduler could not place cleanly. Nothing is dropped silently:
// every problem task is listed here with the reason and what to change.
function IssuesPanel({ issues }: { issues: ScheduleIssue[] }) {
  return (
    <section className="rounded-card border border-amber/40 bg-amber/5 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Needs attention ({issues.length})</h2>
        <Link href="/preferences" className="text-xs text-primary hover:underline">
          Adjust daily limit / study window
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {issues.map((i) => (
          <li key={`${i.taskId}-${i.kind}`} className="flex flex-col gap-1 rounded-lg bg-surface px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
            <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ISSUE_STYLE[i.kind].cls}`}>
              {ISSUE_STYLE[i.kind].label}
            </span>
            <span className="text-sm">
              <span className="font-medium">{i.title}</span>
              <span className="block text-xs text-text-muted">{i.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekCalendar({
  days,
  byDay,
  maxDaily,
  onToggle,
}: {
  days: Date[];
  byDay: Map<string, StudySession[]>;
  maxDaily: number;
  onToggle: (s: StudySession) => void;
}) {
  return (
    // Horizontal scroll on narrow screens instead of squashing 7 columns.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[840px] grid-cols-7 gap-3">
        {days.map((day) => {
          const list = [...(byDay.get(dayKey(day)) ?? [])].sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          );
          const dayMins = list.reduce((acc, s) => acc + minutesOf(s), 0);
          const pct = maxDaily > 0 ? (dayMins / maxDaily) * 100 : 0;
          // > 90% is over-loaded (red), 60-90% caution (yellow), < 60% comfortable.
          const barColor = pct > 90 ? "var(--color-red-600)" : pct >= 60 ? "#eab308" : "var(--accent)";

          return (
            <div key={dayKey(day)} className="flex min-h-48 flex-col rounded-card border border-border bg-surface p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span className="text-xs text-text-muted">{day.getDate()}</span>
              </div>

              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
              </div>

              <div className="flex flex-col gap-1.5">
                {list.length === 0 ? (
                  <span className="text-xs text-text-muted">Free</span>
                ) : (
                  list.map((s) => {
                    const color = s.task.subject?.colorTag ?? "#6366f1";
                    const done = s.completedAt !== null;
                    return (
                      <button
                        key={s.id}
                        onClick={() => onToggle(s)}
                        title={`${s.task.title}: click to mark ${done ? "not done" : "complete"}`}
                        className="rounded-md border-l-4 px-2 py-1 text-left text-xs transition-colors hover:brightness-95"
                        style={{ borderColor: color, background: `${color}14`, opacity: done ? 0.5 : 1 }}
                      >
                        <span className={`block truncate font-medium ${done ? "line-through" : ""}`}>{s.task.title}</span>
                        <span className="text-text-muted">
                          {hhmm(s.startsAt)}-{hhmm(s.endsAt)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
