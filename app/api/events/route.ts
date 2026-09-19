import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/constants";
import { getEnhancer } from "@/lib/ai";
import { getViewerId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/events
 * Discover events with optional filters (all optional):
 *   ?city=Bangalore&type=hackathon&mode=online&timeframe=week&beginner=true&q=ai
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const city = sp.get("city")?.trim() || undefined;
  const type = sp.get("type")?.trim() || undefined;
  const mode = sp.get("mode")?.trim(); // all | online | offline
  const timeframe = sp.get("timeframe")?.trim(); // week | month | all
  const beginner = sp.get("beginner") === "true";
  const q = sp.get("q")?.trim().toLowerCase() || undefined;
  const includePending = sp.get("includePending") === "true";

  const viewerId = await getViewerId();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inWeek = new Date(today.getTime() + 7 * 86400000);
  const inMonth = new Date(today.getTime() + 30 * 86400000);

  const where: Record<string, unknown> = {
    status: includePending ? { in: ["APPROVED", "PENDING"] } : "APPROVED",
    date: { gte: today },
  };

  if (type && EVENT_TYPES.includes(type as never)) where.eventType = type;
  if (mode === "online") where.isOnline = true;
  if (mode === "offline") where.isOnline = false;
  if (beginner) where.beginnerFriendly = true;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { summary: { contains: q } },
      { city: { contains: q } },
      { tags: { contains: q } },
    ];
  }
  if (timeframe === "week") where.date = { gte: today, lte: inWeek };
  if (timeframe === "month") where.date = { gte: today, lte: inMonth };

  const [events, bookmarked] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    }),
    viewerId
      ? db.bookmark.findMany({ where: { viewerId }, select: { eventId: true } })
      : Promise.resolve([]),
  ]);

  const bookmarkedIds = new Set(bookmarked.map((b) => b.eventId));

  return NextResponse.json({
    count: events.length,
    filters: { city, type, mode, timeframe, beginner, q },
    events: events.map((e) => toEventDTO(e, bookmarkedIds)),
    sources: ["mock:devpost", "mock:unstop", "mock:meetup", "mock:gdg"],
  });
}

/**
 * POST /api/events
 * Organizer "List Your Event". Store with status=PENDING and enhance with AI.
 * Body: { title, description, date, city?, isOnline?, eventType, organizer,
 *         link? }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const date = String(body.date ?? "").trim();
  const eventType = String(body.eventType ?? "other").trim();
  const organizer = String(body.organizer ?? "Anonymous").trim();
  const city = String(body.city ?? "").trim() || null;
  const link = String(body.link ?? "").trim() || null;
  const { isOnline } = body;

  if (!title || !description || !date) {
    return NextResponse.json(
      { error: "title, description and date are required" },
      { status: 400 }
    );
  }
  if (!EVENT_TYPES.includes(eventType as never)) {
    return NextResponse.json(
      { error: `eventType must be one of: ${EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "date must be a valid ISO date" }, { status: 400 });
  }

  const enhancement = await getEnhancer().enhance(title, description, link ?? undefined);

  const event = await db.event.create({
    data: {
      title,
      description,
      date: parsedDate,
      city,
      isOnline: typeof isOnline === "boolean" ? isOnline : enhancement.isOnline,
      eventType,
      organizer,
      link,
      summary: enhancement.summary,
      tags: JSON.stringify(enhancement.tags),
      beginnerFriendly: enhancement.beginnerFriendly,
      source: "manual",
      status: "PENDING",
    },
  });

  return NextResponse.json(
    {
      message: "Event submitted. It will appear once approved by a moderator.",
      event: toEventDTO(event),
    },
    { status: 201 }
  );
}