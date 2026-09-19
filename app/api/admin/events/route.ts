import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";

/**
 * GET /api/admin/events
 * List events for moderation. Filter with ?status=PENDING|APPROVED|REJECTED|all
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const approvedStatuses = ["PENDING", "APPROVED", "REJECTED"];
  const where = status && approvedStatuses.includes(status) ? { status } : {};

  const events = await db.event.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    count: events.length,
    events: events.map((e) => toEventDTO(e)),
  });
}