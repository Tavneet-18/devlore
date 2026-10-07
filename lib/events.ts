import type { Event, Prisma } from "@prisma/client";
import { db } from "./db";
import { isEventType } from "./constants";
import type { EventDetails } from "./event-details";
import { parseDetails } from "./event-details";
import { getSchemaCapabilities } from "./schema-capabilities";
import { cityAliases, normaliseMode } from "./event-filters";

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
   * publishes a real registration deadline, "submission" for submissions,
   * and "event-end" when only event dates are available.
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
    deadlineKind: event.source === "devpost" ? "submission"
      : event.source === "hack2skill" && event.deadlineKind === "event-end" ? "submission"
      : event.deadlineKind ?? null,
    alsoOn: sourceRefs ?? [],
    brief: event.brief ?? null,
    whoCanJoin: event.whoCanJoin ?? null,
    details: parseDetails(event.details),
    fetchedAt: event.fetchedAt.toISOString(),
    status: event.status,
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

export function actionableEventWhere(now = new Date()): Prisma.EventWhereInput {
  return {
    OR: [
      { endDate: { gt: now } },
      { endDate: null, date: { gt: now } },
    ],
  };
}

export function buildEventWhere(input: EventQuery, now = new Date()): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [actionableEventWhere(now)];
  if (input.city) {
    // A selected city means a published location match, not every online event.
    and.push({ OR: cityAliases(input.city).map(alias => ({ city: { contains: alias, mode: "insensitive" } })) });
  }
  if (input.q) {
    and.push({ OR: [
      { title: { contains: input.q, mode: "insensitive" } },
      { summary: { contains: input.q, mode: "insensitive" } },
      { city: { contains: input.q, mode: "insensitive" } },
      { tags: { contains: input.q, mode: "insensitive" } },
    ] });
  }
  if (input.timeframe === "week" || input.timeframe === "month") {
    const limit = new Date(now.getTime() + (input.timeframe === "week" ? 7 : 30) * 86400000);
    and.push({ OR: [{ endDate: { lte: limit } }, { endDate: null, date: { lte: limit } }] });
  }
  const where: Prisma.EventWhereInput = { status: "APPROVED", AND: and };
  if (input.type && isEventType(input.type)) where.eventType = input.type;
  const mode = normaliseMode(input.mode);
  if (mode === "online") where.isOnline = true;
  else if (mode === "offline") where.isOnline = false;
  if (input.beginner) where.beginnerFriendly = true;
  return where;
}

/**
 * Columns that have existed since the first migration. Safe to select on any
 * database this code has ever been pointed at.
 */
const EVENT_BASE_SELECT = {
  id: true, title: true, summary: true, description: true,
  date: true, endDate: true, city: true, country: true,
  isOnline: true, eventType: true, organizer: true, link: true,
  imageUrl: true, tags: true, beginnerFriendly: true,
  source: true,
  status: true, createdAt: true, fetchedAt: true,
} as const;

/** Adds migration 001's columns. */
const EVENT_SOURCE_IDENTITY_SELECT = {
  ...EVENT_BASE_SELECT,
  sourceId: true, deadlineKind: true,
} as const;

/** Adds migration 004's columns. */
const EVENT_DETAILS_SELECT = {
  ...EVENT_SOURCE_IDENTITY_SELECT,
  brief: true, whoCanJoin: true, details: true,
} as const;

/** The row shape shared by every variant; later columns are optional. */
export type SelectedEvent = Omit<
  Event,
  "brief" | "whoCanJoin" | "details" | "sourceId" | "deadlineKind"
> &
  Partial<Pick<Event, "brief" | "whoCanJoin" | "details" | "sourceId" | "deadlineKind">>;

/**
 * A single, well-labelled cast.
 *
 * Prisma cannot infer a stable type from a select whose keys are added at
 * runtime, so the three concrete variants are collapsed here rather than
 * forcing a cast at every call site. The later columns are genuinely optional:
 * they are absent until their migration is applied, and the DTO already treats
 * null and absent the same way.
 */
export function asSelected<T>(rows: T[]): SelectedEvent[] {
  return rows as unknown as SelectedEvent[];
}

/**
 * The columns to select from Event, in three tiers.
 *
 * Each tier adds the previous one's columns plus one migration's worth, and the
 * tier is chosen from the live schema probe rather than assumed.
 *
 * This must be built by composition and gated per tier. An earlier version put
 * `sourceId` and `deadlineKind` in the *base* select unconditionally, which
 * meant a database without migration 001 failed every single Event query —
 * with a health check that reported the schema as up to date, because that
 * check only ever verified the original columns. A missing column in a select
 * is a hard Postgres error, not a null, so it takes down every read at once.
 */
export async function eventSelect() {
  const caps = await getSchemaCapabilities();
  if (caps.eventDetails) return EVENT_DETAILS_SELECT;
  if (caps.sourceIdentity) return EVENT_SOURCE_IDENTITY_SELECT;
  return EVENT_BASE_SELECT;
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
