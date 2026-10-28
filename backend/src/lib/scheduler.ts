// Deterministic study-session scheduler (Sprint 3 engine).
//
// This module is a PURE function: the same (tasks, prefs, opts) always produce
// the same planned sessions. No Date.now(), no randomness, no I/O. The only
// clock input is opts.now, which the caller supplies explicitly so tests can
// pin it. This determinism is a hard requirement from the spec: the API
// delete-then-recreates sessions on every regenerate, so a non-deterministic
// scheduler would churn the calendar on identical input.
//
// The scheduler is rule-based, never an LLM. The AI layer only parses free text
// into structured tasks; placement is entirely this code.

// Task-switching-cost mechanism: when two consecutive blocks on the same day
// belong to subjects in DIFFERENT cognitive categories, the break between them
// is widened by this multiplier. Modelling the cognitive reload cost of
// switching between, say, Analytical and Verbal work is the whole point of the
// clustering feature, so the penalty lives here as a named constant.
export const SWITCH_PENALTY = 1.5;

// Priority ranking for the sort (HIGH is most urgent). Higher number sorts first.
const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

// Hard cap on scheduling iterations. A single task is split across at most this
// many day-slices; combined with the per-task loop it bounds total work so a
// pathological input (e.g. a zero-capacity day) can never infinite-loop.
const MAX_ITERATIONS = 100000;

// Planning horizon: the scheduler never places blocks more than this many days
// ahead of `now`. It bounds the work for very large task lists (the day loop
// can never run away) and keeps the calendar meaningful. Minutes that do not
// fit inside the horizon are NOT dropped silently: they are reported as an
// UNSCHEDULED issue (see scheduleIssues) so the UI can say why.
export const HORIZON_DAYS = 60;

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface SchedulerTask {
  id: string;
  deadline: Date | string;
  durationMin: number;
  priority: Priority;
  subjectId: string | null;
  // Only the cognitive category matters for scheduling; colorTag is display-only.
  subject: { cognitiveCategory: string } | null;
  status: string;
}

export interface SchedulerPrefs {
  maxDailyMins: number;
  preferredStart: string; // "HH:MM"
  preferredEnd: string;   // "HH:MM"
  breakMins: number;
  clustering: boolean;
}

// Mirrors the Preference model's @default values: what a user with no saved
// preferences is scheduled with.
export const DEFAULT_PREFS: SchedulerPrefs = {
  maxDailyMins: 180,
  preferredStart: "09:00",
  preferredEnd: "21:00",
  breakMins: 10,
  clustering: true,
};

export interface SchedulerOpts {
  // Reference "now". Day packing starts on this calendar day. Supplied by the
  // caller (the controller passes new Date()) so the function stays pure.
  now?: Date;
}

export interface PlannedSession {
  taskId: string;
  startsAt: Date;
  endsAt: Date;
}

// Parse "HH:MM" into minutes-since-midnight. Used to size the daily window.
function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

// Build an absolute instant for a given calendar day at a minutes-since-midnight
// offset, interpreted in the SERVER'S LOCAL TIME.
//
// Timezone decision (documented once, applied consistently): day boundaries and
// the preferred window are both constructed in server-local time via the Date
// constructor's local-time overload, then stored as the absolute instants those
// locals correspond to. We never mix a UTC-built boundary with a local-built
// one. The server runs in the user's zone (Africa/Johannesburg, UTC+2), so
// "09:00" means 09:00 local and the calendar, which renders these instants in
// the same local zone, shows blocks on the day the scheduler intended. The
// alternative (UTC day boundaries) would shift a 21:00 end two hours and spill
// blocks onto the wrong calendar day.
function instantAt(year: number, month: number, day: number, minutes: number): Date {
  const d = new Date(year, month, day, 0, 0, 0, 0); // local midnight of that day
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function buildSchedule(
  tasks: SchedulerTask[],
  prefs: SchedulerPrefs,
  opts: SchedulerOpts = {}
): PlannedSession[] {
  const now = opts.now ?? new Date();

  // Rule 1: only PENDING or SCHEDULED tasks are placed; DONE tasks are skipped.
  const schedulable = tasks.filter(
    (t) => t.status === "PENDING" || t.status === "SCHEDULED"
  );

  // Rule 2: stable sort by deadline asc, then priority desc, then id asc.
  // The id tiebreak is REQUIRED for determinism: without it, two tasks with the
  // same deadline and priority could reorder between runs and change the output.
  const sorted = [...schedulable].sort((a, b) => {
    const da = new Date(a.deadline).getTime();
    const db = new Date(b.deadline).getTime();
    if (da !== db) return da - db;
    const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (pr !== 0) return pr;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Rule 3: optional clustering. Group same-subject tasks so they are placed
  // consecutively. Within a group we preserve the sorted order; groups are
  // ordered by the position of each group's earliest (first-seen) task, which
  // keeps the overall deadline/priority ordering stable and deterministic.
  const ordered = prefs.clustering ? clusterBySubject(sorted) : sorted;

  // Daily window in minutes-since-midnight. maxDailyMins caps actual task time;
  // breaks do not count against it but must still fit inside the window.
  const windowStart = parseHHMM(prefs.preferredStart);
  const windowEnd = parseHHMM(prefs.preferredEnd);
  const windowMins = Math.max(0, windowEnd - windowStart);
  const dailyTaskCap = Math.max(0, prefs.maxDailyMins);

  const sessions: PlannedSession[] = [];

  // Mutable day cursor, anchored to today's calendar date (local).
  let dayYear = now.getFullYear();
  let dayMonth = now.getMonth();
  let dayDate = now.getDate();

  // Per-day running state.
  let taskMinsUsedToday = 0;      // counts toward maxDailyMins
  // Today only: never place a block in the past. Start at the later of the
  // window start and "now" rounded UP to the next 5 minutes. A task whose
  // deadline has already passed is therefore placed as soon as possible from
  // here, not back-dated (it is flagged OVERDUE by scheduleIssues).
  const nowMin = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0);
  let cursorMin = Math.max(windowStart, Math.ceil(nowMin / 5) * 5);
  let lastCategoryToday: string | null = null; // for the switch penalty

  // Last calendar day (local) a block may be placed on.
  const horizonEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS - 1);
  const pastHorizon = () =>
    new Date(dayYear, dayMonth, dayDate).getTime() > horizonEnd.getTime();

  let iterations = 0;

  // advanceDay: reset per-day counters and move the calendar cursor forward one
  // local day. Using Date arithmetic handles month/year rollover correctly.
  const advanceDay = () => {
    const d = new Date(dayYear, dayMonth, dayDate + 1, 0, 0, 0, 0);
    dayYear = d.getFullYear();
    dayMonth = d.getMonth();
    dayDate = d.getDate();
    taskMinsUsedToday = 0;
    cursorMin = windowStart;
    lastCategoryToday = null;
  };

  // If the window or the daily cap is zero there is no capacity anywhere; bail
  // rather than spin (the iteration cap would also catch this).
  if (windowMins <= 0 || dailyTaskCap <= 0) {
    return sessions;
  }

  for (const task of ordered) {
    let remaining = Math.max(0, task.durationMin);
    const category = task.subject?.cognitiveCategory ?? "General";

    // Rule 5: split a task across days until all its minutes are placed.
    while (remaining > 0) {
      if (++iterations > MAX_ITERATIONS) {
        // Defensive cap: stop rather than loop forever on pathological input.
        return sessions;
      }
      // Out of horizon: stop placing. Every remaining minute (this task and all
      // later ones) is reported as unscheduled rather than pushed ever further.
      if (pastHorizon()) {
        return sessions;
      }

      // Rule 6: compute the break that must precede this block if something is
      // already scheduled today. Same category -> plain break; different
      // category -> widened by the switch penalty (rounded).
      let breakMin = 0;
      if (lastCategoryToday !== null) {
        breakMin =
          category !== lastCategoryToday
            ? Math.round(prefs.breakMins * SWITCH_PENALTY)
            : prefs.breakMins;
      }

      // Remaining task-time capacity for today (breaks excluded, per rule 4).
      const capLeft = dailyTaskCap - taskMinsUsedToday;
      // Remaining room inside the window after the break (breaks must fit here).
      const windowLeft = windowEnd - (cursorMin + breakMin);

      // If neither a break nor even one minute of task fits today, roll over.
      if (capLeft <= 0 || windowLeft <= 0) {
        advanceDay();
        continue;
      }

      // This block's length is bounded by: remaining task minutes, the daily
      // task cap, and the window room left after the break.
      const blockLen = Math.min(remaining, capLeft, windowLeft);
      if (blockLen <= 0) {
        advanceDay();
        continue;
      }

      const blockStartMin = cursorMin + breakMin;
      const blockEndMin = blockStartMin + blockLen;

      sessions.push({
        taskId: task.id,
        startsAt: instantAt(dayYear, dayMonth, dayDate, blockStartMin),
        endsAt: instantAt(dayYear, dayMonth, dayDate, blockEndMin),
      });

      // Advance per-day state.
      cursorMin = blockEndMin;
      taskMinsUsedToday += blockLen;
      lastCategoryToday = category;
      remaining -= blockLen;
    }
  }

  return sessions;
}

// Group tasks by subjectId while preserving input order within each group and
// ordering the groups by the index of their first-seen task. Tasks with no
// subject are each treated as their own singleton group so they are not merged.
function clusterBySubject(sorted: SchedulerTask[]): SchedulerTask[] {
  const groups = new Map<string, SchedulerTask[]>();
  const order: string[] = []; // group keys in first-seen order

  sorted.forEach((task, index) => {
    // Null-subject tasks get a unique key so they stay separate, not clustered.
    const key = task.subjectId ?? `__none_${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(task);
  });

  const result: SchedulerTask[] = [];
  for (const key of order) {
    result.push(...groups.get(key)!);
  }
  return result;
}

// ---------- Schedule issues (never drop a task silently) ----------

export type IssueKind = "OVERDUE" | "AT_RISK" | "UNSCHEDULED";

export interface ScheduleIssue {
  taskId: string;
  title: string;
  kind: IssueKind;
  // Human-readable explanation shown on the dashboard.
  reason: string;
  // Minutes of the task that have no study block at all.
  unplacedMin: number;
  deadline: string;
}

export interface IssueTask {
  id: string;
  title: string;
  deadline: Date | string;
  durationMin: number;
  status: string;
  updatedAt?: Date | string;
}

export interface IssueSession {
  taskId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  createdAt?: Date | string;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

// PURE: derive per-task problems from the stored tasks + sessions. Runs on
// every schedule load (not just on regenerate), so the reasons stay accurate
// as time passes. One task can have several issues (e.g. OVERDUE and
// UNSCHEDULED); the dashboard lists each with its reason.
export function scheduleIssues(
  tasks: IssueTask[],
  sessions: IssueSession[],
  prefs: SchedulerPrefs,
  now: Date
): ScheduleIssue[] {
  const byTask = new Map<string, IssueSession[]>();
  for (const s of sessions) {
    const list = byTask.get(s.taskId) ?? [];
    list.push(s);
    byTask.set(s.taskId, list);
  }
  // When the plan was last generated: the newest planned session's createdAt.
  // A task edited after that simply has not been scheduled YET.
  const lastGenerated = sessions.reduce<number>(
    (max, s) => (s.createdAt ? Math.max(max, new Date(s.createdAt).getTime()) : max),
    0
  );
  const windowMins = Math.max(0, parseHHMM(prefs.preferredEnd) - parseHHMM(prefs.preferredStart));
  const noCapacity = windowMins <= 0 || prefs.maxDailyMins <= 0;

  const issues: ScheduleIssue[] = [];
  // Stable order (deadline, then id) so the list does not jump between loads.
  const ordered = [...tasks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime() || (a.id < b.id ? -1 : 1)
  );

  for (const t of ordered) {
    if (t.status === "DONE") continue;
    const deadline = new Date(t.deadline);
    const own = byTask.get(t.id) ?? [];
    const placed = own.reduce(
      (sum, s) => sum + Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000),
      0
    );
    const unplaced = Math.max(0, t.durationMin - placed);
    const base = { taskId: t.id, title: t.title, deadline: deadline.toISOString() };

    if (deadline.getTime() < now.getTime()) {
      issues.push({
        ...base,
        kind: "OVERDUE",
        reason: `Deadline passed on ${fmtDay(deadline)}. It is scheduled as soon as possible instead of being dropped.`,
        unplacedMin: unplaced,
      });
    }

    if (unplaced > 0) {
      let reason: string;
      if (noCapacity) {
        reason = "Your study window or daily limit is zero, so nothing can be placed. Fix it in Preferences.";
      } else if (t.updatedAt && lastGenerated && new Date(t.updatedAt).getTime() > lastGenerated && placed === 0) {
        reason = "Added or changed after the last schedule. Regenerate the schedule to place it.";
      } else if (sessions.length === 0) {
        reason = "No schedule generated yet. Click Regenerate schedule.";
      } else {
        reason = `${unplaced} min did not fit in the next ${HORIZON_DAYS} days at ${prefs.maxDailyMins} min/day (${prefs.preferredStart}-${prefs.preferredEnd}). Raise the daily limit or widen the window.`;
      }
      issues.push({ ...base, kind: "UNSCHEDULED", reason, unplacedMin: unplaced });
    }

    // Placed (at least partly) but finishing after the deadline.
    if (deadline.getTime() >= now.getTime() && own.length > 0) {
      const lastEnd = Math.max(...own.map((s) => new Date(s.endsAt).getTime()));
      if (lastEnd > deadline.getTime()) {
        issues.push({
          ...base,
          kind: "AT_RISK",
          reason: `Its last study block ends ${fmtDay(new Date(lastEnd))}, after the ${fmtDay(deadline)} deadline. Raise the daily limit, raise its priority, or move the deadline.`,
          unplacedMin: unplaced,
        });
      }
    }
  }
  return issues;
}
