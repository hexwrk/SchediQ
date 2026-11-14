// Subject mastery, 0-100. PURE: derived from the same persisted facts as XP.
//
// Formula (documented in SETUP.md and shown on the dashboard tooltip):
//
//   lessons  = completed lessons / total lessons, over the subject's courses
//   quizzes  = sum of best quiz scores / (total lessons * 100); an untaken quiz counts 0
//   study    = completed study minutes / planned task minutes, for the subject's tasks (capped at 1)
//
//   mastery  = round(100 * (40*lessons + 30*quizzes + 30*study) / (sum of weights that apply))
//
// A component only "applies" when it has a denominator: a subject with no
// course is scored on study alone (out of 100, not capped at 30), and a subject
// with courses but no tasks is scored on lessons + quizzes. No data at all = 0.
//
// "Change this week" re-runs the same formula as of 7 days ago, counting only
// facts timestamped before then. Denominators (lesson/task totals) stay at
// today's values so the delta reflects work done, not work added.

export const MASTERY_WEIGHTS = { lessons: 40, quizzes: 30, study: 30 } as const;

export interface MasteryLesson {
  completedAt: Date | null;
  quizScore: number | null;
  // When the score was earned. Best available timestamp: first pass, else completion.
  quizAt: Date | null;
}

export interface MasteryInput {
  lessons: MasteryLesson[];
  plannedTaskMinutes: number;
  completedSessions: { durationMin: number; completedAt: Date }[];
}

export interface MasteryComponents {
  lessons: number | null; // 0-1, null when not applicable
  quizzes: number | null;
  study: number | null;
}

function before(d: Date | null, asOf: Date | undefined): boolean {
  return d !== null && (asOf === undefined || d.getTime() <= asOf.getTime());
}

export function masteryComponents(input: MasteryInput, asOf?: Date): MasteryComponents {
  const total = input.lessons.length;
  const lessons = total > 0 ? input.lessons.filter((l) => before(l.completedAt, asOf)).length / total : null;
  const quizzes =
    total > 0
      ? input.lessons.reduce((sum, l) => sum + (before(l.quizAt, asOf) ? l.quizScore ?? 0 : 0), 0) / (total * 100)
      : null;
  const studied = input.completedSessions
    .filter((s) => before(s.completedAt, asOf))
    .reduce((sum, s) => sum + s.durationMin, 0);
  const study = input.plannedTaskMinutes > 0 ? Math.min(1, studied / input.plannedTaskMinutes) : null;
  return { lessons, quizzes, study };
}

export function masteryScore(input: MasteryInput, asOf?: Date): number {
  const c = masteryComponents(input, asOf);
  let weighted = 0;
  let weights = 0;
  for (const key of ["lessons", "quizzes", "study"] as const) {
    const v = c[key];
    if (v === null) continue;
    weighted += MASTERY_WEIGHTS[key] * v;
    weights += MASTERY_WEIGHTS[key];
  }
  return weights === 0 ? 0 : Math.round((100 * weighted) / weights);
}
