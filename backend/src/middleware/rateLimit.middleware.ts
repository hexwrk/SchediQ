import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../lib/env";

// Rate limits. In-memory store: correct for a single Render instance; a
// horizontally scaled deploy would need a shared store (e.g. Redis) so the
// counters are not per-process. Behind Render's proxy the client IP comes from
// X-Forwarded-For, which is why app.ts sets trust proxy = 1.

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Credential endpoints: ~10 requests / 15 min / IP / endpoint. Slows password
// guessing and reset-link spraying to a crawl while a real user who mistypes a
// few times is never affected. One limiter per route so a login lockout does
// not also block registering or resetting.
export function authLimiter(action: string) {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: `Too many ${action} attempts from this network. Try again in 15 minutes.`, code: "RATE_LIMITED" },
  });
}

// Lookups fired while typing (username availability): ~60 / 15 min / IP.
// Enough for a real sign-up with plenty of edits, too slow to scrape the
// username space.
export function lookupLimiter(action: string) {
  return rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: `Too many ${action} requests from this network. Try again in 15 minutes.`, code: "RATE_LIMITED" },
  });
}

// AI endpoints: AI_RATE_LIMIT_PER_HOUR requests / hour / USER (default 200).
// An abuse and cost guard (every call can cost money), not a plan limit, so it
// is generous enough that a demo never hits it. Keyed by the authenticated
// user id, so it must be mounted after requireAuth; the IP fallback only
// applies if that ordering is ever broken.
export function aiLimiter() {
  const limit = env().AI_RATE_LIMIT_PER_HOUR;
  return rateLimit({
    windowMs: ONE_HOUR,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip ?? "")),
    message: { error: `AI request limit reached (${limit} per hour). Try again later.`, code: "RATE_LIMITED" },
  });
}
