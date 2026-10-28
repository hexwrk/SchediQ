const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  // Per-field messages from the server's zod validation (400s), keyed by field.
  fieldErrors: Record<string, string[]>;
  // Machine-readable reason, e.g. "UPGRADE_REQUIRED" on a 402 tier cap.
  code?: string;
  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}, code?: string) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }

  // First server message for one field, for the "error under the input" slot.
  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0];
  }

  get upgradeRequired(): boolean {
    return this.status === 402 && this.code === "UPGRADE_REQUIRED";
  }
}

function toApiError(body: { error?: string; code?: string; details?: { fieldErrors?: Record<string, string[]> } }, status: number) {
  return new ApiError(body.error ?? "Request failed", status, body.details?.fieldErrors ?? {}, body.code);
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw toApiError(body, res.status);
  }

  return body as T;
}

// Authenticated request whose response is a FILE (backup download). Returns the
// blob and the server-chosen filename from Content-Disposition.
async function requestFile(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) {
    throw toApiError(await res.json().catch(() => ({})), res.status);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "schediq-backup";
  return {
    blob: await res.blob(),
    filename,
    format: res.headers.get("X-Backup-Format"),
    fallback: res.headers.get("X-Backup-Fallback"),
  };
}

// Multipart upload. No Content-Type header: the browser sets the boundary.
async function requestUpload<T>(path: string, token: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw toApiError(body, res.status);
  return body as T;
}

export type Role = "USER" | "SUPER_ADMIN";
export type AccountType = "FREE" | "PREMIUM";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  accountType: AccountType;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<{ user: AuthUser }>("/api/auth/me", { token }),
};

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskStatus = "PENDING" | "SCHEDULED" | "DONE";

export interface Subject {
  id: string;
  name: string;
  cognitiveCategory: string;
  colorTag: string;
}

export interface Task {
  id: string;
  title: string;
  deadline: string;
  durationMin: number;
  priority: TaskPriority;
  status: TaskStatus;
  subjectId: string | null;
  subject: Subject | null;
}

export interface TaskInput {
  title: string;
  deadline: string;
  durationMin: number;
  priority?: TaskPriority;
  subjectId?: string | null;
}

export const tasksApi = {
  list: (token: string) => request<{ tasks: Task[] }>("/api/tasks", { token }),
  create: (token: string, data: TaskInput) =>
    request<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(data), token }),
  update: (token: string, id: string, data: Partial<TaskInput> & { status?: TaskStatus }) =>
    request<{ task: Task }>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),
  remove: (token: string, id: string) =>
    request<void>(`/api/tasks/${id}`, { method: "DELETE", token }),
};

export type CognitiveCategory = "Analytical" | "Verbal" | "Technical" | "General";

export interface SubjectInput {
  name: string;
  cognitiveCategory: string;
  colorTag?: string;
}

export const subjectsApi = {
  list: (token: string) => request<{ subjects: Subject[] }>("/api/subjects", { token }),
  create: (token: string, data: SubjectInput) =>
    request<{ subject: Subject }>("/api/subjects", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),
  update: (token: string, id: string, data: Partial<SubjectInput>) =>
    request<{ subject: Subject }>(`/api/subjects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),
  remove: (token: string, id: string) =>
    request<void>(`/api/subjects/${id}`, { method: "DELETE", token }),
};

export interface Preference {
  id: string;
  maxDailyMins: number;
  preferredStart: string;
  preferredEnd: string;
  breakMins: number;
  clustering: boolean;
}

export interface PreferenceInput {
  maxDailyMins?: number;
  preferredStart?: string;
  preferredEnd?: string;
  breakMins?: number;
  clustering?: boolean;
}

export const preferencesApi = {
  get: (token: string) =>
    request<{ preferences: Preference }>("/api/preferences", { token }),
  update: (token: string, data: PreferenceInput) =>
    request<{ preferences: Preference }>("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),
};

// A StudySession as returned by the API, with its task and that task's subject
// embedded so the calendar can render and colour blocks without extra fetches.
export interface StudySession {
  id: string;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  taskId: string;
  task: Task;
}

export const sessionsApi = {
  list: (token: string) =>
    request<{ sessions: StudySession[] }>("/api/sessions", { token }),
  generate: (token: string) =>
    request<{ sessions: StudySession[] }>("/api/sessions/generate", {
      method: "POST",
      token,
    }),
  toggle: (token: string, id: string, completed: boolean) =>
    request<{ session: StudySession }>(`/api/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
      token,
    }),
};

// Structured output of the AI/rule parser. source tells the UI which path ran.
export interface ParsedTask {
  title: string;
  subjectId: string | null;
  subjectName: string;
  cognitiveCategory: CognitiveCategory | null;
  deadline: string | null;
  durationMin: number;
  priority: TaskPriority;
  isNewSubject: boolean;
  source: "rule" | "openai" | "fallback";
}

export const aiApi = {
  parse: (token: string, text: string) =>
    request<ParsedTask>("/api/ai/parse", {
      method: "POST",
      body: JSON.stringify({ text }),
      token,
    }),
};

// Gamification. All fields are DERIVED server-side from completed sessions.
export interface LevelProgress {
  level: number;
  intoLevel: number;
  toNext: number;
  span: number;
}

export interface Badge {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  level: number;
  rank: number;
  isCurrentUser: boolean;
  isDemo: boolean;
}

export type XpSource = "session" | "focus_bonus" | "lesson" | "quiz" | "active_day" | "course";

export interface XpEvent {
  source: XpSource;
  amount: number;
  at: string;
  label: string;
}

export interface Progress {
  xp: number;
  level: number;
  levelTitle: string;
  levelProgress: LevelProgress;
  streak: number;
  badges: Badge[];
  breakdown: Record<XpSource, number>;
  xpRules: {
    values: Record<string, number>;
    sources: { source: XpSource; label: string; howTo: string; amount: string }[];
  };
  recentEvents: XpEvent[];
  leaderboard: LeaderboardEntry[];
  rank: number | null;
  totalUsers: number;
}

export interface SubjectMastery {
  subjectId: string;
  name: string;
  colorTag: string;
  mastery: number;
  changeThisWeek: number;
  components: { lessons: number | null; quizzes: number | null; study: number | null };
}

export interface CourseCard {
  id: string;
  title: string;
  topic: string;
  level: string;
  subject: { id: string; name: string; colorTag: string } | null;
  lessonsDone: number;
  lessonsTotal: number;
  completed: boolean;
}

export interface Overview {
  week: {
    start: string;
    studyMinutes: number;
    lessonsCompleted: number;
    quizzesPassed: number;
    xpEarned: number;
    streak: number;
    level: number;
    levelTitle: string;
    xp: number;
  };
  mastery: SubjectMastery[];
  masteryWeights: { lessons: number; quizzes: number; study: number };
  courses: CourseCard[];
  trend: { date: string; xp: number; studyMinutes: number }[];
}

export const progressApi = {
  get: (token: string) => request<Progress>("/api/progress", { token }),
  overview: (token: string) => request<Overview>("/api/progress/overview", { token }),
};

// ---------- Account / tier ----------

export interface Usage {
  used: number;
  limit: number | null; // null = unlimited (PREMIUM)
  remaining: number | null;
}

export const accountApi = {
  get: (token: string) =>
    request<{ user: AuthUser; usage: { aiParses: Usage } }>("/api/account", { token }),
  // Demo upgrade: flips the tier, no payment.
  setTier: (token: string, accountType: AccountType) =>
    request<{ user: AuthUser; usage: { aiParses: Usage } }>("/api/account/tier", {
      method: "PATCH",
      body: JSON.stringify({ accountType }),
      token,
    }),
};

// ---------- Courses ----------

export type CourseLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface QuizQuestion {
  question: string;
  options: string[];
  // Only present after the learner has submitted the quiz once.
  answerIndex?: number;
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  content: string;
  keyPoints: string[];
  quiz: QuizQuestion[];
  completedAt: string | null;
  quizScore: number | null;
  quizPassedAt: string | null;
  courseId: string;
  task?: { id: string; status: TaskStatus } | null;
}

export interface CourseProgress {
  lessonsDone: number;
  lessonsTotal: number;
  percent: number;
  avgQuizScore: number | null;
  completed: boolean;
}

export interface Course {
  id: string;
  title: string;
  topic: string;
  level: CourseLevel;
  description: string;
  source: "AI" | "SEED";
  createdAt: string;
  scheduledAt: string | null;
  subjectId: string | null;
  subject: { id: string; name: string; colorTag: string } | null;
  progress: CourseProgress;
}

export interface CourseDetail extends Course {
  lessons: Lesson[];
}

export interface CourseInput {
  topic: string;
  level: CourseLevel;
  lessonCount: number;
  subjectId?: string | null;
}

export interface QuizResult {
  score: number;
  passed: boolean;
  correct: boolean[];
  answerKey: number[];
}

export const coursesApi = {
  list: (token: string) => request<{ courses: Course[]; usage: Usage }>("/api/courses", { token }),
  get: (token: string, id: string) => request<{ course: CourseDetail }>(`/api/courses/${id}`, { token }),
  generate: (token: string, data: CourseInput) =>
    request<{ course: CourseDetail; fallback: boolean; usage: Usage }>("/api/courses/generate", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),
  link: (token: string, id: string, subjectId: string | null) =>
    request<{ course: Course }>(`/api/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ subjectId }),
      token,
    }),
  remove: (token: string, id: string) => request<void>(`/api/courses/${id}`, { method: "DELETE", token }),
  schedule: (token: string, id: string) =>
    request<{ tasksCreated: number }>(`/api/courses/${id}/schedule`, { method: "POST", token }),
};

export const lessonsApi = {
  update: (token: string, id: string, data: { completed?: boolean; quizAnswers?: number[] }) =>
    request<{ lesson: Lesson; result: QuizResult | null }>(`/api/lessons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),
};

// ---------- Super admin ----------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  accountType: AccountType;
  createdAt: string;
  taskCount: number;
  subjectCount: number;
  sessionCount: number;
}

export interface BackupLogEntry {
  id: string;
  createdAt: string;
  kind: "BACKUP" | "RESTORE";
  format: "sql" | "json";
  filename: string;
  sizeBytes: number;
  actorEmail: string;
}

export interface AdminStats {
  counts: { users: number; tasks: number; sessions: number; completedSessions: number; subjects: number };
  usersByRole: Partial<Record<Role, number>>;
  usersByTier: Partial<Record<AccountType, number>>;
  databaseSizeBytes: number;
  lastBackup: BackupLogEntry | null;
  lastRestore: BackupLogEntry | null;
  generatedAt: string;
}

export interface DataModel {
  entities: { name: string; rows: number; purpose: string; relations: string[] }[];
  flows: string[];
  generatedAt: string;
}

export const adminApi = {
  users: (token: string) => request<{ users: AdminUser[] }>("/api/admin/users", { token }),
  updateUser: (token: string, id: string, data: { role?: Role; accountType?: AccountType }) =>
    request<{ user: AuthUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),
  deleteUser: (token: string, id: string) =>
    request<void>(`/api/admin/users/${id}`, { method: "DELETE", token }),
  stats: (token: string) => request<AdminStats>("/api/admin/stats", { token }),
  dataModel: (token: string) => request<DataModel>("/api/admin/data-model", { token }),
  backup: (token: string) => requestFile("/api/admin/backup", token, { method: "POST" }),
  restore: (token: string, file: File) => {
    const form = new FormData();
    form.append("confirm", "RESTORE");
    form.append("file", file);
    return requestUpload<{ ok: boolean; format: string; restoredFrom: string }>("/api/admin/restore", token, form);
  },
};
