import type { Event, Prisma } from "@prisma/client";
import { db } from "./db";
import { isEventType } from "./constants";
import type { EventDetails } from "./event-details";
import { parseDetails } from "./event-details";
import { getSchemaCapabilities } from "./schema-capabilities";

export function parseTags(event: Pick<Event, "tags">): string[] {
  try {
    const parsed = JSON.parse(event.tags);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export interface EventDTO {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  date: string;
  endDate: string | null;
  city: string | null;
  country: string;
  isOnline: boolean;
  eventType: string;
  organizer: string;
  link: string | null;
  imageUrl: string | null;
  tags: string[];
  beginnerFriendly: boolean;
  source: string;
  /**
   * Which date the countdown measures: "registration" when the platform
   * publishes a real registration deadline, "event-end" when it does not.
   * The UI must not call a finish date a closing date.
   */
  deadlineKind: string | null;
  /** Every platform this same event was also seen on, after a cross-source merge. */
  alsoOn: { source: string; link: string | null }[];
  /**
   * The in-site brief, when there was enough source text to write one honestly.
   * Null is the normal case today: measured across all four new adapters, none
   * publishes any prose, so the page shows the structured facts instead.
   */
  brief: string | null;
  /** One line derived only from the eligibility fields the source published. */
  whoCanJoin: string | null;
  /** Structured facts, already schema-validated. Never contains guesses. */
  details: EventDetails | null;
  /** When we last pulled this listing, for the "last checked" line. */
  fetchedAt: string;
  status: string;
  viewCount: number;
  createdAt: string;
  bookmarked?: boolean;
}

export function toEventDTO(
  event: SelectedEvent,
  bookmarkedIds?: Set<string>,
  sourceRefs?: { source: string; link: string | null }[]
): EventDTO {
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    description: event.description,
    date: event.date.toISOString(),
    endDate: event.endDate?.toISOString() ?? null,
    city: event.city,
    country: event.country,
    isOnline: event.isOnline,
    eventType: event.eventType,
    organizer: event.organizer,
    link: event.link,
    imageUrl: event.imageUrl ?? null,
    tags: parseTags(event),
    beginnerFriendly: event.beginnerFriendly,
    source: event.source,
    deadlineKind: event.deadlineKind ?? null,
    alsoOn: sourceRefs ?? [],
    brief: event.brief ?? null,
    whoCanJoin: event.whoCanJoin ?? null,
    details: parseDetails(event.details),
    fetchedAt: event.fetchedAt.toISOString(),    status: event.status,
    viewCount: event.viewCount,
    createdAt: event.createdAt.toISOString(),
    bookmarked: bookmarkedIds ? bookmarkedIds.has(event.id) : undefined,
  };
}

export function toEventDTOs(events: SelectedEvent[], bookmarkedIds?: Set<string>): EventDTO[] {
  return events.map((e) => toEventDTO(e, bookmarkedIds));
}

export type EventQuery = {
  city?: string;
  type?: string;
  mode?: string;
  timeframe?: string;
  beginner?: boolean;
  q?: string;
};

export function buildEventWhere(input: EventQuery): Prisma.EventWhereInput {
  const now = new Date();

  // An event is still relevant if either its start OR its end is in the
  // future. Multi-day events (and hackathons with an open submission window)
  // often have a start date in the past while registration is still open.
  const stillRelevant: Prisma.EventWhereInput = {
    OR: [{ date: { gte: now } }, { endDate: { gte: now } }],
  };

  // Local array because Prisma types AND as a union of object | array.
  const and: Prisma.EventWhereInput[] = [stillRelevant];

  if (input.city) {
    // Online events are always relevant to a city search.
    and.push({ OR: [{ city: { contains: input.city } }, { isOnline: true }] });
  }

  if (input.q) {
    and.push({ title: { contains: input.q } });
  }

  // Timeframe selects events overlapping the coming window.
  if (input.timeframe === "week") {
    and.push({ date: { lte: addDays(now, 7) } });
  } else if (input.timeframe === "month") {
    and.push({ date: { lte: addDays(now, 30) } });
  }

  const where: Prisma.EventWhereInput = {
    status: "APPROVED",
    AND: and,
  };

  if (input.type && input.type !== "All" && isEventType(input.type)) {
    where.eventType = input.type;
  }

  if (input.mode === "online") where.isOnline = true;
  else if (input.mode === "offline") where.isOnline = false;

  if (input.beginner) where.beginnerFriendly = true;

  return where;
}

const EVENT_BASE_SELECT = {
  id: true, title: true, summary: true, description: true,
  date: true, endDate: true, city: true, country: true,
  isOnline: true, eventType: true, organizer: true, link: true,
  imageUrl: true, tags: true, beginnerFriendly: true,
  source: true, sourceId: true, deadlineKind: true,
  status: true, viewCount: true, createdAt: true, fetchedAt: true,
} as const;

const EVENT_DETAILS_SELECT = {
  ...EVENT_BASE_SELECT,
  brief: true, whoCanJoin: true, details: true,
} as const;

/** The row shape both variants share, before the migration-004 columns. */
export type SelectedEvent = Omit<
  Event,
  "brief" | "whoCanJoin" | "details" | "sourceId" | "deadlineKind"
> &
  Partial<Pick<Event, "brief" | "whoCanJoin" | "details" | "sourceId" | "deadlineKind">>;

/**
 * A single, well-labelled cast.
 *
 * Prisma cannot infer a stable type from a select whose keys are added at
 * runtime, so the two concrete variants (with and without the migration-004
 * columns) are collapsed here rather than forcing a cast at every call site.
 * `brief`, `whoCanJoin` and `details` are genuinely optional: they are absent
 * until migration 004 is applied, and the DTO already treats null and absent
 * the same way.
 */
export function asSelected<T>(rows: T[]): SelectedEvent[] {
  return rows as unknown as SelectedEvent[];
}

/**
 * An explicit column list rather than a bare findMany.
 *
 * A bare findMany selects every column, which makes the events API throw
 * outright if it is deployed before migration 004 has been applied. Selecting
 * explicitly, and dropping the new columns until the probe says they exist, is
 * what lets code ship ahead of the manual migration without an outage.
 */
export async function eventSelect() {
  const caps = await getSchemaCapabilities();
  return caps.eventDetails ? EVENT_DETAILS_SELECT : EVENT_BASE_SELECT;
}

export async function queryEvents(
  input: EventQuery
): Promise<{ events: SelectedEvent[]; count: number }> {
  const where = buildEventWhere(input);
  const [events, count] = await Promise.all([
    db.event.findMany({
      where,
      select: await eventSelect(),
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
      take: 80,
    }),
    db.event.count({ where }),
  ]);
  return { events: asSelected(events), count };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
