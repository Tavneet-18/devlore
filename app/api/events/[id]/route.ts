import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/constants";
import { getViewerId } from "@/lib/session";

/**
 * GET /api/events/[id]
 * Event detail. Records a view (used by the recommendation engine).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewerId = await getViewerId();

  const event = await db.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (viewerId) {
    await db.view.create({ data: { eventId: id, viewerId } });
    await db.event.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }

  const bookmark = viewerId
    ? await db.bookmark.findUnique({ where: { viewerId_eventId: { viewerId, eventId: id } } })
    : null;

  return NextResponse.json({
    event: toEventDTO(event, new Set(bookmark ? [id] : [])),
  });
}

/**
 * PUT /api/events/[id]
 * Admin edit of any event fields.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  const stringField = (key: string) => {
    const v = body[key];
    if (typeof v === "string") data[key] = v.trim() || null;
  };

  stringField("title");
  stringField("description");
  stringField("summary");
  stringField("city");
  stringField("organizer");
  stringField("link");

  if (typeof body.isOnline === "boolean") data.isOnline = body.isOnline;
  if (typeof body.beginnerFriendly === "boolean") data.beginnerFriendly = body.beginnerFriendly;
  if (typeof body.status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(body.status)) {
    data.status = body.status;
  }
  if (typeof body.eventType === "string" && EVENT_TYPES.includes(body.eventType as never)) {
    data.eventType = body.eventType;
  }
  if (typeof body.date === "string" && !Number.isNaN(new Date(body.date).getTime())) {
    data.date = new Date(body.date);
  }
  if (Array.isArray(body.tags)) {
    data.tags = JSON.stringify(body.tags.map(String));
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await db.event.update({ where: { id }, data });
  return NextResponse.json({ event: toEventDTO(updated) });
}

/**
 * DELETE /api/events/[id]
 * Admin delete.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.event.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ message: "Event deleted" });
}