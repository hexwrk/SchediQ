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

export const subjectsApi = {
  list: (token: string) => request<{ subjects: Subject[] }>("/api/subjects", { token }),
  create: (token: string, data: { name: string; cognitiveCategory: string; colorTag?: string }) =>
    request<{ subject: Subject }>("/api/subjects", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),
};
