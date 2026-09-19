import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

export const dynamic = "force-dynamic";

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev if no secret set
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await ingestAll(CITIES);
  const total = results.reduce((acc, r) => ({ upserted: acc.upserted + r.upserted, approved: acc.approved + r.approved, pending: acc.pending + r.pending, errors: acc.errors + r.errors }), { upserted: 0, approved: 0, pending: 0, errors: 0 });
  return NextResponse.json({ ok: true, cities: CITIES, results, total, ts: new Date().toISOString() });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Allow manual trigger with custom cities: { cities: ["Bangalore"] }
  let cities = CITIES;
  try {
    const body = await request.json().catch(() => null);
    if (body?.cities && Array.isArray(body.cities) && body.cities.length > 0) {
      cities = body.cities.map(String).slice(0, 10);
    }
  } catch {}
  const results = await ingestAll(cities);
  const total = results.reduce((acc, r) => ({ upserted: acc.upserted + r.upserted, approved: acc.approved + r.approved, pending: acc.pending + r.pending, errors: acc.errors + r.errors }), { upserted: 0, approved: 0, pending: 0, errors: 0 });
  return NextResponse.json({ ok: true, cities, results, total, ts: new Date().toISOString() });
}
