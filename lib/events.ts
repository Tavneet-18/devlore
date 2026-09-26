import type { Event, Prisma } from "@prisma/client";
import { db } from "./db";
import { isEventType } from "./constants";

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
  status: string;
  viewCount: number;
  createdAt: string;
  bookmarked?: boolean;
}

export function toEventDTO(event: Event, bookmarkedIds?: Set<string>): EventDTO {
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
    status: event.status,
    viewCount: event.viewCount,
    createdAt: event.createdAt.toISOString(),
    bookmarked: bookmarkedIds ? bookmarkedIds.has(event.id) : undefined,
  };
}

export function toEventDTOs(events: Event[], bookmarkedIds?: Set<string>): EventDTO[] {
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

export async function queryEvents(input: EventQuery): Promise<{ events: Event[]; count: number }> {
  const where = buildEventWhere(input);
  const [events, count] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
      take: 80,
    }),
    db.event.count({ where }),
  ]);
  return { events, count };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
