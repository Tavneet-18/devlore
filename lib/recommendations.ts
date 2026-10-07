import type { Event } from "@prisma/client";
import { parseTags } from "./events";
import { parseDetails } from "./event-details";
import { isActionable } from "./event-dates";

/**
 * The fields the similarity score actually reads.
 *
 * Declared structurally rather than as `Event` so it accepts both a full Prisma
 * row and one from `eventSelect()`, which omits the migration-004 columns until
 * they exist. Scoring has no business reading a brief.
 */
type Scored = Pick<Event, "id" | "status" | "tags" | "eventType" | "beginnerFriendly" | "isOnline" | "city" | "date" | "endDate" | "source"> &
  Partial<Pick<Event, "deadlineKind" | "details">>;

function scoreSimilarity(a: Scored, b: Scored): number {
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
export function similarEvents<T extends Scored>(event: Scored, all: T[], limit = 3, now = Date.now()): T[] {
  return all
    .filter((e) => e.id !== event.id && e.status === "APPROVED" && isActionable({
      date: e.date.toISOString(),
      endDate: e.endDate?.toISOString(),
      source: e.source,
      deadlineKind: e.deadlineKind,
      details: parseDetails(e.details),
    }, now))
    .map((e) => ({ e, s: scoreSimilarity(event, e) }))
    .filter((x) => x.s > 0)
    // Tiebreak on the soonest event, not on viewCount. The counter was dropped
    // in 20261004010000_drop_view_counter; while it existed it was always 0, so
    // it never broke a tie in practice and only added a field to carry. Among
    // equally similar events, the one happening first is the more useful
    // suggestion anyway.
    .sort((x, y) => y.s - x.s || (x.e.endDate ?? x.e.date).getTime() - (y.e.endDate ?? y.e.date).getTime())
    .slice(0, limit)
    .map((x) => x.e);
}

/*
 * recommendForViewer() was removed here.
 *
 * It personalised from a visitor's past views and bookmarks, weighting tags by
 * how often they had engaged with them. It had no callers, and the only part of
 * it that could not be reimplemented trivially — reading `db.view` — went away
 * with the counter. The bookmark half was always reachable from lib/dedupe.ts
 * and the index filters, which is where a reader actually narrows a list.
 *
 * Rather than leave it as dead code that reads a table this schema no longer
 * has, it is deleted. If personalised recommendations are ever wanted, the
 * honest version starts from bookmarks, which do have a viewer id for anyone who
 * saved something.
 */