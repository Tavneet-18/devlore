import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { VIEWER_COOKIE } from "@/lib/session";

/**
 * DELETE /api/bookmarks/[eventId]
 * Remove a saved event.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const jar = await cookies();
  const viewerId = jar.get(VIEWER_COOKIE)?.value;
  if (!viewerId) return NextResponse.json({ message: "Nothing to remove" });

  await db.bookmark.deleteMany({ where: { viewerId, eventId } });
  return NextResponse.json({ message: "Removed" });
}