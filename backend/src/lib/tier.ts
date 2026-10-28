import { prisma } from "./prisma";
import { FREE_AI_PARSES_PER_DAY } from "../../../shared/validation";

// Demo subscription tiers. FREE is capped on AI parses per day; PREMIUM is
// unlimited. There is no billing: the tier is a flag flipped from the Upgrade
// page so the gate can be demonstrated end to end.

// Local midnight, matching the scheduler's server-local day boundaries.
function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export interface AiUsage {
  used: number;
  // null = unlimited (PREMIUM).
  limit: number | null;
  remaining: number | null;
}

export async function aiUsageFor(userId: string, accountType: string, now = new Date()): Promise<AiUsage> {
  const used = await prisma.aiParseLog.count({
    where: { userId, createdAt: { gte: startOfToday(now) } },
  });
  if (accountType === "PREMIUM") {
    return { used, limit: null, remaining: null };
  }
  return {
    used,
    limit: FREE_AI_PARSES_PER_DAY,
    remaining: Math.max(0, FREE_AI_PARSES_PER_DAY - used),
  };
}
