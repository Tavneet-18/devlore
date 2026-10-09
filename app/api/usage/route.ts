import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { UsageSchema } from "@/lib/feedback-contracts";
import { countUsage } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-identity";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  const limited = await rateLimit(`usage:${clientKey(request.headers)}`, { limit: 60, windowSeconds: 60 });
  if (!limited.success) return new NextResponse(null, { status: 429 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UsageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid usage event" }, { status: 400 });
  try {
    if (parsed.data.kind === "outbound_click") {
      const event = await db.event.findFirst({ where: { id: parsed.data.eventId, status: "APPROVED", link: { not: null } }, select: { id: true } });
      if (!event) return new NextResponse(null, { status: 404 });
    }
    const kinds = parsed.data.kind === "search"
      ? parsed.data.empty ? ["search", "empty_search"] as const : ["search"] as const
      : ["outbound_click"] as const;
    const counted = await countUsage([...kinds]);
    return new NextResponse(null, { status: counted ? 204 : 503 });
  } catch { return new NextResponse(null, { status: 503 }); }
}
