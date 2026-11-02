import { prisma } from "./prisma";
import { FREE_AI_PARSES_PER_DAY, TIER_LIMITS_ENABLED } from "../../../shared/validation";

// Subscription tiers. While TIER_LIMITS_ENABLED is false (the demo) nothing is
// capped on any tier and Premium is a preview of a future update. With it on,
// FREE is capped on AI parses per day and generated courses; PREMIUM is
// unlimited. There is no billing either way.

// Local midnight, matching the scheduler's server-local day boundaries.
function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// The cap that applies to this account, or null for unlimited. The single
// place the tier gates are decided: the controllers only compare against it.
export function tierLimit(accountType: string, freeCap: number, enabled = TIER_LIMITS_ENABLED): number | null {
  if (!enabled || accountType === "PREMIUM") return null;
  return freeCap;
}

export interface AiUsage {
  used: number;
  // null = unlimited (PREMIUM, or every tier while limits are off).
  limit: number | null;
  remaining: number | null;
}

export async function aiUsageFor(userId: string, accountType: string, now = new Date()): Promise<AiUsage> {
  const used = await prisma.aiParseLog.count({
    where: { userId, createdAt: { gte: startOfToday(now) } },
  });
  const limit = tierLimit(accountType, FREE_AI_PARSES_PER_DAY);
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}
