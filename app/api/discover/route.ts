import { NextResponse, type NextRequest } from "next/server";
import { discoverEvents } from "@/lib/ai/discovery";

/**
 * GET /api/discover?location=Bangalore
 * Read-only preview of the discovery pipeline (fetch → clean → dedupe).
 * Does NOT write to the database — that is what /api/cron/ingest does.
 * Source set is chosen by DISCOVERY_MODE (mock | live).
 */
export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location")?.trim();
  if (!location) {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }

  const result = await discoverEvents(location);

  return NextResponse.json({
    ...result,
    note:
      result.provider === "live-sources"
        ? "Fetched live from public source APIs. Run /api/cron/ingest to persist."
        : "Simulated feeds (DISCOVERY_MODE=mock).",
  });
}