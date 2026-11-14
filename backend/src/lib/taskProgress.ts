// Per-task progress. PURE and DERIVED from the task's study sessions (their
// start/end and completedAt), so the task list, the dashboard and the status
// field all read the same numbers and nothing can drift. A reload recomputes
// it from the database.

export interface ProgressSession {
  startsAt: Date | string;
  endsAt: Date | string;
  completedAt: Date | string | null;
}

export interface TaskProgress {
  totalMin: number; // sum of session durations (task.durationMin if no sessions)
  completedMin: number; // sum of completed session durations
  percent: number; // round(completedMin / totalMin * 100); 0 if no sessions
  sessionsTotal: number;
  sessionsDone: number;
  nextSessionAt: string | null; // earliest NOT completed session, or null
}

export type DerivedStatus = "PENDING" | "SCHEDULED" | "IN_PROGRESS" | "DONE";

const minutes = (s: ProgressSession) =>
  Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000);

export function taskProgress(durationMin: number, sessions: ProgressSession[]): TaskProgress {
  const done = sessions.filter((s) => s.completedAt !== null);
  const sessionMin = sessions.reduce((sum, s) => sum + minutes(s), 0);
  const completedMin = done.reduce((sum, s) => sum + minutes(s), 0);
  const totalMin = sessions.length > 0 ? sessionMin : durationMin;
  const next = sessions
    .filter((s) => s.completedAt === null)
    .map((s) => new Date(s.startsAt).getTime())
    .sort((a, b) => a - b)[0];
  return {
    totalMin,
    completedMin,
    // Clamp: a session edited to zero length must never yield >100% or NaN.
    percent: sessions.length > 0 && totalMin > 0 ? Math.min(100, Math.round((completedMin / totalMin) * 100)) : 0,
    sessionsTotal: sessions.length,
    sessionsDone: done.length,
    nextSessionAt: next === undefined ? null : new Date(next).toISOString(),
  };
}

// Status rule kept in sync with progress whenever a session is toggled:
//   0 sessions                -> PENDING
//   sessions, none completed  -> SCHEDULED
//   some (not all) completed  -> IN_PROGRESS
//   all completed (100%)      -> DONE
export function statusFromSessions(sessionsTotal: number, sessionsDone: number): DerivedStatus {
  if (sessionsTotal === 0) return "PENDING";
  if (sessionsDone === sessionsTotal) return "DONE";
  if (sessionsDone > 0) return "IN_PROGRESS";
  return "SCHEDULED";
}
