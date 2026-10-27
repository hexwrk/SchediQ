const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    throw new ApiError(body.error ?? "Request failed", res.status);
  }

  return body as T;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, password: string, name?: string) =>
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

export interface Progress {
  xp: number;
  level: number;
  levelProgress: LevelProgress;
  streak: number;
  badges: Badge[];
  leaderboard: LeaderboardEntry[];
  rank: number | null;
  totalUsers: number;
}

export const progressApi = {
  get: (token: string) => request<Progress>("/api/progress", { token }),
};
