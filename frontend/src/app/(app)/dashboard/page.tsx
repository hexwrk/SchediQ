"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Preference,
  StudySession,
  preferencesApi,
  sessionsApi,
  tasksApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RefreshIcon } from "@/lib/icons";

const DAY_MS = 24 * 60 * 60 * 1000;
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

export default function DashboardPage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [prefs, setPrefs] = useState<Preference | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [sRes, pRes] = await Promise.all([
        sessionsApi.list(token),
        preferencesApi.get(token),
      ]);
      setSessions(sRes.sessions);
      setPrefs(pRes.preferences);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function regenerate() {
    if (!token) return;
    setRegenerating(true);
    setError(null);
    try {
      const { sessions } = await sessionsApi.generate(token);
      setSessions(sessions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  // Toggle the clicked block's task between DONE and PENDING, then reload so the
  // KPIs and styling stay consistent.
  async function toggleTask(s: StudySession) {
    if (!token) return;
    const next = s.task.status === "DONE" ? "PENDING" : "DONE";
    try {
      await tasksApi.update(token, s.taskId, { status: next });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    }
  }

  // Build the 7-day window starting today (local midnight).
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: WEEK_DAYS }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, StudySession[]>();
    for (const s of sessions) {
      const key = dayKey(new Date(s.startsAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  // KPI figures.
  const windowEnd = days.length ? days[days.length - 1].getTime() + DAY_MS : 0;
  const scheduledMins = sessions
    .filter((s) => new Date(s.startsAt).getTime() < windowEnd)
    .reduce((acc, s) => acc + minutesOf(s), 0);
  const completedMins = sessions
    .filter((s) => s.task.status === "DONE")
    .reduce((acc, s) => acc + minutesOf(s), 0);
  const activeTasks = new Set(
    sessions.filter((s) => s.task.status !== "DONE").map((s) => s.taskId)
  ).size;
  const totalForTrack = completedMins + scheduledMins;
  const onTrack = totalForTrack > 0 ? Math.round((completedMins / totalForTrack) * 100) : 0;

  const maxDaily = prefs?.maxDailyMins ?? 180;

  if (loading) {
    return <p className="text-sm text-text-muted">Loading dashboard...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Your study week at a glance.</p>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshIcon width={16} height={16} />
          {regenerating ? "Regenerating..." : "Regenerate schedule"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* KPI chips */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active tasks" value={String(activeTasks)} accent="var(--primary)" />
        <Kpi
          label="Scheduled this week"
          value={`${(scheduledMins / 60).toFixed(1)}h`}
          accent="var(--accent)"
        />
        <Kpi
          label="Completed"
          value={`${(completedMins / 60).toFixed(1)}h`}
          accent="var(--violet)"
        />
        <Kpi label="On-track" value={`${onTrack}%`} accent="var(--amber)" />
      </div>

      {/* Weekly calendar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const list = (byDay.get(dayKey(day)) ?? []).sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          );
          const dayMins = list.reduce((acc, s) => acc + minutesOf(s), 0);
          const pct = maxDaily > 0 ? (dayMins / maxDaily) * 100 : 0;
          const barColor =
            pct > 90 ? "var(--amber)" : pct >= 60 ? "#eab308" : "var(--accent)";
          // > 90% is over-loaded (red/amber), 60-90% caution, < 60% comfortable.
          const barRed = pct > 90 ? "#dc2626" : barColor;

          return (
            <div
              key={dayKey(day)}
              className="flex min-h-48 flex-col rounded-card border border-border bg-surface p-3"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span className="text-xs text-text-muted">{day.getDate()}</span>
              </div>

              {/* per-day load bar */}
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, pct)}%`, background: barRed }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                {list.length === 0 ? (
                  <span className="text-xs text-text-muted">—</span>
                ) : (
                  list.map((s) => {
                    const color = s.task.subject?.colorTag ?? "#6366f1";
                    const done = s.task.status === "DONE";
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleTask(s)}
                        title={`${s.task.title} — click to toggle done`}
                        className="rounded-md border-l-4 px-2 py-1 text-left text-xs transition-colors hover:brightness-95"
                        style={{
                          borderColor: color,
                          background: `${color}14`,
                          opacity: done ? 0.5 : 1,
                        }}
                      >
                        <span
                          className={`block truncate font-medium ${done ? "line-through" : ""}`}
                        >
                          {s.task.title}
                        </span>
                        <span className="text-text-muted">
                          {hhmm(s.startsAt)}–{hhmm(s.endsAt)}
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

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
