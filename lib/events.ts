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
  const where: Prisma.EventWhereInput = {
    status: "APPROVED",
    date: { gte: new Date() },
  };

  if (input.city) {
    where.OR = [{ city: { contains: input.city } }, { isOnline: true }];
  }

  if (input.type && input.type !== "All" && isEventType(input.type)) {
    where.eventType = input.type;
  }

  if (input.mode === "online") where.isOnline = true;
  else if (input.mode === "offline") where.isOnline = false;

  if (input.timeframe === "week") {
    where.date = { gte: new Date(), lte: addDays(new Date(), 7) };
  } else if (input.timeframe === "month") {
    where.date = { gte: new Date(), lte: addDays(new Date(), 30) };
  }

  if (input.beginner) where.beginnerFriendly = true;

  if (input.q) {
    where.AND = [{ title: { contains: input.q } }];
  }

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
