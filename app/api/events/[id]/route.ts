import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEventDTO, eventSelect, asSelected } from "@/lib/events";
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

  // Explicit select: a bare findUnique would break against a database where
  // migration 004 has not been applied yet.
  const event = await db.event.findUnique({ where: { id }, select: await eventSelect() });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (viewerId) {
    // Deduplicated, matching the detail page: one row per browser per event.
    // A bare create would now hit the unique constraint on the second call from
    // the same browser and throw, turning a repeat API read into a 500.
    await db.view
      .createMany({ data: [{ eventId: id, viewerId }], skipDuplicates: true })
      .then(({ count }) =>
        count > 0
          ? db.event.update({ where: { id }, data: { viewCount: { increment: 1 } } })
          : null
      )
      .catch(() => null);
  }

  const [bookmark, refs] = await Promise.all([
    viewerId
      ? db.bookmark.findUnique({ where: { viewerId_eventId: { viewerId, eventId: id } } })
      : null,
    // Tolerates the pre-migration schema, where this table does not exist.
    db.eventSourceRef
      .findMany({ where: { eventId: id }, select: { source: true, link: true } })
      .catch(() => []),
  ]);

  return NextResponse.json({
    event: toEventDTO(asSelected([event])[0], new Set(bookmark ? [id] : []), refs),
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
  const existing = await db.event.findUnique({ where: { id }, select: { id: true } });
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

  await db.event.update({ where: { id }, data });
  const updated = await db.event.findUniqueOrThrow({
    where: { id },
    select: await eventSelect(),
  });
  return NextResponse.json({ event: toEventDTO(asSelected([updated])[0]) });
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

  // Distinguish "no such event" from "the delete failed". The previous version
  // swallowed the error and answered 200 "Event deleted" unconditionally, so a
  // moderator deleting a row that had a foreign-key violation or a dropped
  // connection was told it worked, watched the row survive the refetch, and had
  // no way to tell a no-op from a success.
  const existing = await db.event.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    await db.event.delete({ where: { id } });
  } catch (err) {
    console.error(`[events] delete ${id} failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Delete failed. The event is still there." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Event deleted" });
}