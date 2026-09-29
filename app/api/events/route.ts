import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/constants";
import { getEnhancer } from "@/lib/ai";
import { getViewerId } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-identity";

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

  // Collected as a local array because Prisma types AND as a union.
  const and: Prisma.EventWhereInput[] = [
    // Still relevant = start OR end in the future. Hackathons often have a
    // start date in the past while registration remains open.
    { OR: [{ date: { gte: today } }, { endDate: { gte: today } }] },
  ];

  if (city) {
    // Online events match every city filter, mirroring the UI expectation.
    and.push({
      OR: [{ city: { contains: city, mode: "insensitive" } }, { isOnline: true }],
    });
  }

  if (q) {
    // Postgres LIKE is case-sensitive, so without an explicit insensitive
    // mode a search for "ai" silently misses every event titled "AI" and the
    // filter looks broken for no visible reason.
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // The timeframes select on the DEADLINE, matching how the spatial axis
  // positions every card. Filtering on the start date instead hid events
  // that had already opened but are still closing inside the window.
  if (timeframe === "week" || timeframe === "month") {
    const limit = timeframe === "week" ? inWeek : inMonth;
    and.push({
      OR: [{ endDate: { lte: limit } }, { endDate: null, date: { lte: limit } }],
    });
  }

  const where: Prisma.EventWhereInput = {
    status: includePending ? { in: ["APPROVED", "PENDING"] } : "APPROVED",
    AND: and,
  };

  if (type && EVENT_TYPES.includes(type as never)) where.eventType = type;
  if (mode === "online") where.isOnline = true;
  if (mode === "offline") where.isOnline = false;
  if (beginner) where.beginnerFriendly = true;

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

  const liveMode = (process.env.DISCOVERY_MODE ?? "mock") === "live";

  return NextResponse.json({
    count: events.length,
    filters: { city, type, mode, timeframe, beginner, q },
    events: events.map((e) => toEventDTO(e, bookmarkedIds)),
    sources: ["devpost", "unstop", "gdg", "manual"].map((s) => `${liveMode ? "live" : "mock"}:${s}`),
  });
}

/**
 * POST /api/events
 * Organizer "List Your Event". Store with status=PENDING and enhance with AI.
 * Body: { title, description, date, city?, isOnline?, eventType, organizer,
 *         link?, website? }
 *
 * `website` is a honeypot: it is hidden from humans and never rendered, so a
 * bot that helpfully fills in every field it finds gets rejected while real
 * submitters are unaffected. It is validated before any database work.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(`submit:${clientKey(request.headers)}`, {
    limit: 5,
    windowSeconds: 600,
  });
  if (!limited.success) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.resetSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot. Answer as though accepted so a bot learns nothing, but write
  // nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json(
      {
        message: "Event submitted. It will appear once approved by a moderator.",
      },
      { status: 201 }
    );
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