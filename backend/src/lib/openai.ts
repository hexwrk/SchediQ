import type OpenAI from "openai";
import { env } from "./env";

// One place for every OpenAI call: whether AI is on, how the client is built,
// and how failures are logged. Callers keep their offline fallback (rule
// parser, SEED course templates) for ANY error thrown from here.

// Hard per-request ceiling. Without it a stalled connection holds the user's
// request (and a server socket) open for the SDK's 10-minute default.
const TIMEOUT_MS = 20_000;
// One retry, which the SDK applies only to transient failures: connection
// errors, 408, 409, 429 and 5xx (with backoff). 4xx like a bad key or invalid
// request are not retried. Worst case is therefore ~2 x 20s before fallback.
const MAX_RETRIES = 1;

export function aiEnabled(): boolean {
  const e = env();
  return e.AI_PARSER === "openai" && !!e.OPENAI_API_KEY;
}

// Imported lazily so the package is only loaded when AI is actually used.
export async function openAiClient(): Promise<OpenAI> {
  const { default: OpenAIClient } = await import("openai");
  return new OpenAIClient({ apiKey: env().OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
}

// Anything shaped like an API key. OpenAI's own 401 message echoes a masked
// key ("Incorrect API key provided: sk-proj-****abcd"); strip even that.
const KEY_PATTERN = /\bsk-[A-Za-z0-9_*.-]+/g;

// Logs WHAT failed (status, error code, short message) but never the key, the
// request headers or the prompt, which contains the user's text.
export function logAiFailure(context: string, err: unknown): void {
  const e = err as { name?: string; status?: number; code?: string | null; message?: string };
  // The SDK's error classes (AuthenticationError, APIConnectionTimeoutError...)
  // keep name = "Error"; the class name is the useful part.
  const kind = err instanceof Error && err.constructor.name !== "Error" ? err.constructor.name : (e?.name ?? "Error");
  const parts = [
    kind,
    e?.status !== undefined ? `status=${e.status}` : null,
    e?.code ? `code=${e.code}` : null,
  ].filter(Boolean);
  const message = (e?.message ?? String(err)).replace(KEY_PATTERN, "sk-[redacted]").slice(0, 200);
  console.error(`[ai] ${context} failed, using offline fallback: ${parts.join(" ")}: ${message}`);
}
