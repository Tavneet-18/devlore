import { NextResponse, type NextRequest } from "next/server";
import { discoverEvents } from "@/lib/ai/discovery";

/**
 * GET /api/discover?location=Bangalore
 * Runs the AI discovery pipeline (fetch → clean → dedupe) across the
 * simulated external platforms. Swap sources via DISCOVERY_MODE=live.
 */
export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location")?.trim();
  if (!location) {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }

  const result = await discoverEvents(location);

  return NextResponse.json({
    ...result,
    note: "Discovered from simulated Devpost/Unstop/Meetup/GDG feeds.",
  });
}