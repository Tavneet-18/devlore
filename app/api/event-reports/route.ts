import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ReportSchema } from "@/lib/feedback-contracts";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-identity";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  const limited = await rateLimit(`report:${clientKey(request.headers)}`, { limit: 5, windowSeconds: 600 });
  if (!limited.success) {
    return NextResponse.json({ error: "Too many reports. Please try again later." }, {
      status: 429, headers: { "Retry-After": String(limited.resetSeconds) },
    });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid reason and keep your comment within 500 characters." }, { status: 400 });
  try {
    const event = await db.event.findFirst({ where: { id: parsed.data.eventId, status: "APPROVED" }, select: { id: true } });
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    await db.eventReport.create({ data: parsed.data });
    return NextResponse.json({ message: "Report received. Thank you for helping improve this listing." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Reporting is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
