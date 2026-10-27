// Gamification engine (Sprint 3). PURE and DERIVED: every number here is
// computed from the user's completed study sessions, never stored or hardcoded,
// so XP/level/streak/badges always stay consistent with the real schedule.
//
// The only external input is a list of completed sessions, each carrying its
// duration, completion timestamp, and the cognitive category of its task's
// subject. The same input always yields the same output.

export interface CompletedSession {
  id: string;
  durationMin: number;
  completedAt: Date;
  // Subject of the session's task (null if the task has no subject).
  subjectId: string | null;
  // Cognitive category of the session's task's subject ("General" if none).
  cognitiveCategory: string;
}

export interface LevelProgress {
  level: number;
  intoLevel: number; // XP earned inside the current level
  toNext: number;    // XP still needed to reach the next level
  span: number;      // total XP width of the current level (intoLevel + toNext)
}

export interface Badge {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

// XP for one completed session. Base scales with time-on-task (3 min = 1 XP).
// focusBonus rewards low task-switching: a session that follows another
// completed session EARLIER THE SAME DAY in the SAME cognitive category earns a
// 25% bonus. This is the whole point of the clustering mechanic surfaced as a
// reward, so it is deliberate and commented.
export function xpForSession(durationMin: number, focusBonus: boolean): number {
  const base = Math.round(durationMin / 3);
  return focusBonus ? Math.round(base * 1.25) : base;
}

// Local calendar-day key so "same day" and streak logic use the server/user
// zone (UTC+2) consistently, matching how the scheduler builds instants.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Walk the completed sessions day by day in time order, applying the focus
// bonus to consecutive same-category sessions within each day, and sum XP.
export function totalXp(sessions: CompletedSession[]): number {
  const sorted = [...sessions].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );

  let xp = 0;
  let currentDay: string | null = null;
  let prevCategory: string | null = null;

  for (const s of sorted) {
    const key = dayKey(s.completedAt);
    if (key !== currentDay) {
      // New day resets the "previous session" chain.
      currentDay = key;
      prevCategory = null;
    }
    const focusBonus = prevCategory !== null && prevCategory === s.cognitiveCategory;
    xp += xpForSession(s.durationMin, focusBonus);
    prevCategory = s.cognitiveCategory;
  }

  return xp;
}

// Cumulative XP required to have REACHED level L: 100 * (L-1) * L / 2.
// L1=0, L2=100, L3=300, L4=600, L5=1000, ...
export function cumXpForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

// Resolve an XP total into a level and the progress within that level.
export function levelFromXp(xp: number): LevelProgress {
  let level = 1;
  // Advance while the XP clears the next level's threshold.
  while (xp >= cumXpForLevel(level + 1)) {
    level++;
  }
  const floor = cumXpForLevel(level);
  const ceil = cumXpForLevel(level + 1);
  return {
    level,
    intoLevel: xp - floor,
    toNext: ceil - xp,
    span: ceil - floor,
  };
}

// Consecutive-day streak up to today: walk back from today while each day has
// at least one completed session. Breaks on the first gap. A streak that ended
// yesterday (nothing today yet) still counts today as the anchor only if today
// has a session; otherwise the most recent unbroken run is measured from the
// latest active day backwards but must include today or yesterday to be "live".
export function currentStreak(sessions: CompletedSession[], now: Date): number {
  const activeDays = new Set(sessions.map((s) => dayKey(s.completedAt)));
  if (activeDays.size === 0) return 0;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Allow the streak to anchor on today or, if today is empty, yesterday, so a
  // user who has not yet studied today does not instantly lose their streak.
  let cursor = today;
  if (!activeDays.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
    if (!activeDays.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

// "Was every session that day complete" (Clean Sweep) is not derivable from the
// completed list alone, so the caller computes it (it knows each day's total)
// and passes it in. Everything else here derives from the completed sessions.
export function computeBadges(
  sessions: CompletedSession[],
  now: Date,
  opts: { cleanSweep: boolean }
): Badge[] {
  const xp = totalXp(sessions);
  const { level } = levelFromXp(xp);
  const streak = currentStreak(sessions, now);

  // Deep Focus: two SAME-SUBJECT completed sessions back-to-back within a day.
  const sorted = [...sessions].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );
  let deepFocus = false;
  let currentDay: string | null = null;
  let prevSubject: string | null | undefined = undefined;
  for (const s of sorted) {
    const key = dayKey(s.completedAt);
    if (key !== currentDay) {
      currentDay = key;
      prevSubject = undefined;
    }
    // Only a real subject counts (null subjects are not "same subject").
    if (prevSubject !== undefined && s.subjectId !== null && prevSubject === s.subjectId) {
      deepFocus = true;
    }
    prevSubject = s.subjectId;
  }

  return [
    {
      key: "first_focus",
      label: "First Focus",
      description: "Complete your first study session",
      unlocked: sessions.length >= 1,
    },
    {
      key: "century",
      label: "Century",
      description: "Earn 100 XP",
      unlocked: xp >= 100,
    },
    {
      key: "rising_star",
      label: "Rising Star",
      description: "Reach level 3",
      unlocked: level >= 3,
    },
    {
      key: "clean_sweep",
      label: "Clean Sweep",
      description: "Complete every session planned for a day",
      unlocked: opts.cleanSweep,
    },
    {
      key: "deep_focus",
      label: "Deep Focus",
      description: "Finish two same-subject sessions back-to-back",
      unlocked: deepFocus,
    },
    {
      key: "week_warrior",
      label: "Week Warrior",
      description: "Hold a 7-day streak",
      unlocked: streak >= 7,
    },
  ];
}
