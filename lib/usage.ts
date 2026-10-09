import { db } from "./db";

export type UsageKind = "search" | "empty_search" | "save" | "outbound_click";

/** UTC daily totals only. No query text, IP, cookie or event-level history. */
export async function countUsage(kinds: UsageKind[], now = new Date()): Promise<boolean> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  try {
    await db.$transaction(kinds.map(kind => db.dailyMetric.upsert({
      where: { day_kind: { day, kind } },
      create: { day, kind, count: 1 },
      update: { count: { increment: 1 } },
    })));
    return true;
  } catch {
    // Metrics must never interrupt discovery or saving, including before the
    // additive migration lands. Report unavailable rather than fake success.
    console.warn("Devlore usage counter unavailable");
    return false;
  }
}
