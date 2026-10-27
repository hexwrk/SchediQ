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
  let cursorMin = windowStart;    // next free minute-of-day inside the window
  let lastCategoryToday: string | null = null; // for the switch penalty

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
