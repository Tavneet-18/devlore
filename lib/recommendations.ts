import type { Event } from "@prisma/client";
import { db } from "./db";
import { parseTags } from "./events";

function scoreSimilarity(a: Event, b: Event): number {
  let score = 0;
  const aTags = new Set(parseTags(a));
  const bTags = new Set(parseTags(b));
  for (const t of aTags) if (bTags.has(t)) score += 2;
  if (a.eventType === b.eventType) score += 3;
  if (a.beginnerFriendly === b.beginnerFriendly) score += 1;
  if (a.isOnline === b.isOnline) score += 1;
  if (!a.isOnline && a.city && a.city === b.city) score += 2;
  return score;
}

/** Events most similar to `event`, excluding the event itself. */
export function similarEvents(event: Event, all: Event[], limit = 3): Event[] {
  return all
    .filter((e) => e.id !== event.id && e.status === "APPROVED")
    .map((e) => ({ e, s: scoreSimilarity(event, e) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || y.e.viewCount - x.e.viewCount)
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * Personalized recommendations for an anonymous visitor based on their
 * past views and bookmarks. Tags they engaged with get weighted and used
 * to rank upcoming approved events.
 */
export async function recommendForViewer(
  viewerId: string | null,
  all: Event[],
  limit = 6
): Promise<Event[]> {
  if (!viewerId) return [];

  const [views, bookmarks] = await Promise.all([
    db.view.findMany({ where: { viewerId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.bookmark.findMany({ where: { viewerId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const engagedIds = new Set([...views.map((v) => v.eventId), ...bookmarks.map((b) => b.eventId)]);
  if (engagedIds.size === 0) return [];

  const byId = new Map(all.map((e) => [e.id, e]));
  const weights = new Map<string, number>();

  for (const v of views) {
    const e = byId.get(v.eventId);
    if (!e) continue;
    for (const t of parseTags(e)) weights.set(t, (weights.get(t) ?? 0) + 10);
    if (e.eventType) weights.set(`type:${e.eventType}`, (weights.get(`type:${e.eventType}`) ?? 0) + 5);
    if (e.city) weights.set(`city:${e.city}`, (weights.get(`city:${e.city}`) ?? 0) + 3);
  }
  for (const b of bookmarks) {
    const e = byId.get(b.eventId);
    if (!e) continue;
    for (const t of parseTags(e)) weights.set(t, (weights.get(t) ?? 0) + 20);
    if (e.eventType) weights.set(`type:${e.eventType}`, (weights.get(`type:${e.eventType}`) ?? 0) + 10);
    if (e.city) weights.set(`city:${e.city}`, (weights.get(`city:${e.city}`) ?? 0) + 6);
  }

  const now = new Date();

  const scored = all
    .filter(
      (e) =>
        e.status === "APPROVED" &&
        !engagedIds.has(e.id) &&
        // Still upcoming if either endpoint is in the future — hackathons
        // often start earlier while registration stays open.
        (e.date >= now || (e.endDate !== null && e.endDate >= now))
    )
    .map((e) => {
      let score = 0;
      for (const t of parseTags(e)) score += weights.get(t) ?? 0;
      score += weights.get(`type:${e.eventType}`) ?? 0;
      if (e.city) score += weights.get(`city:${e.city}`) ?? 0;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.date.getTime() - b.e.date.getTime());

  return scored.slice(0, limit).map((x) => x.e);
}