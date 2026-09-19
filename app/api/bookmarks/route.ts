import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { newViewerId, VIEWER_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

async function getOrCreateViewer(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VIEWER_COOKIE)?.value;
  if (existing) return existing;
  const id = newViewerId();
  jar.set(VIEWER_COOKIE, id, COOKIE_OPTS);
  return id;
}

/**
 * GET /api/bookmarks
 * Saved events for the anonymous visitor.
 */
export async function GET() {
  const viewerId = await getOrCreateViewer();
  const bookmarks = await db.bookmark.findMany({
    where: { viewerId },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    count: bookmarks.length,
    events: bookmarks
      .filter((b) => b.event)
      .map((b) => toEventDTO(b.event, new Set([b.event.id]))),
  });
}

/**
 * POST /api/bookmarks { eventId }
 * Bookmark (save) an event.
 */
export async function POST(request: NextRequest) {
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const viewerId = await getOrCreateViewer();
  const event = await db.event.findUnique({ where: { id: body.eventId } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  await db.bookmark.upsert({
    where: { viewerId_eventId: { viewerId, eventId: body.eventId } },
    create: { viewerId, eventId: body.eventId },
    update: {},
  });

  return NextResponse.json({ message: "Saved" }, { status: 201 });
}