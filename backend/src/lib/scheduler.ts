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

// Distribution rules (the "spread, don't front-load" behaviour).
//
// MAX_FOCUS_MIN: longest single block. A task's time on one day is merged into
// ONE block, unless it exceeds this, in which case it is split into equal
// blocks of at most this length with a normal break between them.
export const MAX_FOCUS_MIN = 90;
// MIN_DAILY_SHARE_MIN: the smallest per-day share a task is spread into. A task
// is spread over at most floor(minutes / this) days, so a 60-min task stays one
// block instead of becoming 7 slivers of 9 minutes across a week.
export const MIN_DAILY_SHARE_MIN = 45;
// MIN_FRAGMENT_MIN: never create a block shorter than this just because a day
// has a few minutes of capacity left (unless that finishes the task).
export const MIN_FRAGMENT_MIN = 15;
// MAX_LESSONS_PER_DAY: course lessons are paced, at most this many lessons of
// the same course on one day, so "add course to schedule" spreads a course over
// several days instead of stacking every lesson on the first one.
export const MAX_LESSONS_PER_DAY = 1;

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
  // Set for tasks created from a course lesson ("add course to schedule").
  // Lessons are paced per course (MAX_LESSONS_PER_DAY) instead of spread.
  courseId?: string | null;
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

  // Daily window in minutes-since-midnight. maxDailyMins caps actual task time;
  // breaks do not count against it but must still fit inside the window.
  const windowStart = parseHHMM(prefs.preferredStart);
  const windowEnd = parseHHMM(prefs.preferredEnd);
  const dailyTaskCap = Math.max(0, prefs.maxDailyMins);
  if (windowEnd - windowStart <= 0 || dailyTaskCap <= 0) {
    // No capacity anywhere: nothing is placed, and scheduleIssues reports every
    // task as UNSCHEDULED with the reason (never a silent drop).
    return [];
  }

  // ---- Day model: day 0 = today (local), up to HORIZON_DAYS days.
  // Today only: never place a block in the past. Start at the later of the
  // window start and "now" rounded UP to the next 5 minutes. A task whose
  // deadline has already passed is therefore placed as soon as possible from
  // here, not back-dated (it is flagged OVERDUE by scheduleIssues).
  const nowMin =
    now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0);
  const dayStartMin = (d: number) => (d === 0 ? Math.max(windowStart, Math.ceil(nowMin / 5) * 5) : windowStart);
  const dayDate = (d: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);

  // Worst-case break in front of any block (the switch-penalty break). Window
  // time for it is RESERVED at allocation, so the layout pass below can never
  // run past the end of the window whatever order blocks end up in.
  const maxBreak = Math.max(prefs.breakMins, Math.round(prefs.breakMins * SWITCH_PENALTY));
  const blocksFor = (m: number) => Math.ceil(m / MAX_FOCUS_MIN);

  const taskUsed: number[] = new Array(HORIZON_DAYS).fill(0); // vs maxDailyMins
  const windowFree: number[] = Array.from({ length: HORIZON_DAYS }, (_, d) =>
    Math.max(0, windowEnd - dayStartMin(d))
  );
  // Allocation result: per day, the ordered list of (task, minutes).
  const perDay: { task: SchedulerTask; minutes: number }[][] = Array.from({ length: HORIZON_DAYS }, () => []);
  // Lessons already placed per course per day (pacing).
  const lessonsOn = new Map<string, number>();

  let iterations = 0;
  const guard = () => ++iterations > MAX_ITERATIONS;

  // Largest amount of `want` minutes that fits on day d (daily cap AND window,
  // including the break reserved before each resulting block).
  const fitOn = (d: number, want: number): number => {
    let m = Math.min(want, dailyTaskCap - taskUsed[d], windowFree[d]);
    while (m > 0 && m + blocksFor(m) * maxBreak > windowFree[d]) {
      m -= m + blocksFor(m) * maxBreak - windowFree[d];
    }
    return Math.max(0, m);
  };
  const place = (d: number, task: SchedulerTask, m: number) => {
    perDay[d].push({ task, minutes: m });
    taskUsed[d] += m;
    windowFree[d] -= m + blocksFor(m) * maxBreak;
  };
  // A placement smaller than MIN_FRAGMENT_MIN is skipped unless it finishes the task.
  const worthPlacing = (m: number, remaining: number) => m >= MIN_FRAGMENT_MIN || (m > 0 && m === remaining);

  // Local day index of an instant relative to today (negative = already past).
  const todayMs = dayDate(0).getTime();
  const dayIndexOf = (instant: Date) => {
    const local = new Date(instant.getFullYear(), instant.getMonth(), instant.getDate());
    // Round, not floor: a DST shift makes some "days" 23 or 25 hours long.
    return Math.round((local.getTime() - todayMs) / 86400000);
  };

  // ---- Phase 1: allocate minutes to days, one task at a time.
  for (const task of sorted) {
    let remaining = Math.max(0, task.durationMin);
    if (remaining === 0) continue;
    const lastDay = Math.min(HORIZON_DAYS - 1, dayIndexOf(new Date(task.deadline)));

    if (task.courseId) {
      // Course lesson: deadlines are soft pacing targets, so the rule is "at
      // most MAX_LESSONS_PER_DAY of this course per day". Place it whole on the
      // earliest such day with room; lessons are short, so this is one block.
      for (let d = 0; d < HORIZON_DAYS && remaining > 0; d++) {
        if (guard()) return finish();
        const key = `${task.courseId}|${d}`;
        if ((lessonsOn.get(key) ?? 0) >= MAX_LESSONS_PER_DAY) continue;
        const m = fitOn(d, remaining);
        if (!worthPlacing(m, remaining)) continue;
        place(d, task, m);
        remaining -= m;
        lessonsOn.set(key, (lessonsOn.get(key) ?? 0) + 1);
      }
      continue;
    }

    // Days up to and including the deadline day that still have room.
    const before: number[] = [];
    for (let d = 0; d <= lastDay; d++) {
      if (fitOn(d, MIN_FRAGMENT_MIN) > 0 || fitOn(d, remaining) === remaining) before.push(d);
    }

    // (a) Spread evenly. Use at most floor(remaining / MIN_DAILY_SHARE_MIN)
    // days (at least 1), picked evenly across the run-up to the deadline.
    // Each visited day re-targets ceil(remaining / slots left), so a day that
    // could not take its full share carries the shortfall forward.
    const slots = Math.min(before.length, Math.max(1, Math.floor(remaining / MIN_DAILY_SHARE_MIN)));
    const chosen = Array.from({ length: slots }, (_, i) => before[Math.floor((i * before.length) / slots)]);
    for (let i = 0; i < chosen.length && remaining > 0; i++) {
      if (guard()) return finish();
      const target = Math.ceil(remaining / (chosen.length - i));
      const m = fitOn(chosen[i], target);
      if (!worthPlacing(m, remaining)) continue;
      place(chosen[i], task, m);
      remaining -= m;
    }

    // (b) Shortfall: any other day before the deadline with room, in order.
    const chosenSet = new Set(chosen);
    for (const d of before) {
      if (remaining <= 0) break;
      if (guard()) return finish();
      if (chosenSet.has(d)) continue;
      const m = fitOn(d, remaining);
      if (!worthPlacing(m, remaining)) continue;
      place(d, task, m);
      remaining -= m;
    }

    // (c) Still not done: as early as possible AFTER the deadline (or from
    // today when the deadline already passed). scheduleIssues flags the task
    // AT_RISK / OVERDUE; minutes beyond the horizon are reported UNSCHEDULED.
    for (let d = Math.max(0, lastDay + 1); d < HORIZON_DAYS && remaining > 0; d++) {
      if (guard()) return finish();
      const m = fitOn(d, remaining);
      if (!worthPlacing(m, remaining)) continue;
      place(d, task, m);
      remaining -= m;
    }
  }

  return finish();

  // ---- Phase 2: lay each day out in time order.
  function finish(): PlannedSession[] {
    const sessions: PlannedSession[] = [];
    for (let d = 0; d < HORIZON_DAYS; d++) {
      if (perDay[d].length === 0) continue;
      // Within a day, keep allocation order (deadline/priority), and with
      // clustering on, group same-subject work so it runs back to back.
      const order = prefs.clustering
        ? clusterBySubject(perDay[d].map((p) => p.task)).map((t) => perDay[d].find((p) => p.task === t)!)
        : perDay[d];
      const date = dayDate(d);
      let cursor = dayStartMin(d);
      let lastCategory: string | null = null;
      for (const { task, minutes } of order) {
        const category = task.subject?.cognitiveCategory ?? "General";
        // ONE block per task per day, or equal blocks of <= MAX_FOCUS_MIN.
        const n = blocksFor(minutes);
        for (let b = 0; b < n; b++) {
          const len = Math.floor(minutes / n) + (b < minutes % n ? 1 : 0);
          // Switch penalty: a different cognitive category from the previous
          // block widens the break by SWITCH_PENALTY.
          const brk =
            lastCategory === null ? 0 : category !== lastCategory ? Math.round(prefs.breakMins * SWITCH_PENALTY) : prefs.breakMins;
          const start = cursor + brk;
          sessions.push({
            taskId: task.id,
            startsAt: instantAt(date.getFullYear(), date.getMonth(), date.getDate(), start),
            endsAt: instantAt(date.getFullYear(), date.getMonth(), date.getDate(), start + len),
          });
          cursor = start + len;
          lastCategory = category;
        }
      }
    }
    return sessions;
  }
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
