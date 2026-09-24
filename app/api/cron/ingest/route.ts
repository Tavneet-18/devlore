import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ingestAll } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

/**
 * Vercel Cron calls GET /api/cron/ingest and does NOT attach an
 * Authorization header — it authenticates the request to the deployment
 * itself. So we accept either:
 *   1. `Authorization: Bearer <CRON_SECRET>` (manual curl / GitHub Action), or
 *   2. `?secret=<CRON_SECRET>`
 * and only require a secret on non-Vercel origins, so the scheduled run works
 * out of the box while the endpoint is not open to the public internet.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: only allow when running on Vercel itself,
    // otherwise the endpoint would be an open write API.
    return process.env.VERCEL === "1";
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  if (!provided) return false;

  // Constant-time compare to avoid leaking the secret via timing.
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function citiesFrom(body: unknown): string[] {
  if (body && typeof body === "object" && "cities" in body) {
    const cities = (body as { cities?: unknown }).cities;
    if (Array.isArray(cities) && cities.length > 0) {
      return cities.map(String).slice(0, 10);
    }
  }
  return DEFAULT_CITIES;
}

async function run(cities: string[]) {
  const startedAt = Date.now();
  const results = await ingestAll(cities);
  const total = results.reduce(
    (acc, r) => ({
      upserted: acc.upserted + r.upserted,
      approved: acc.approved + r.approved,
      pending: acc.pending + r.pending,
      errors: acc.errors + r.errors,
    }),
    { upserted: 0, approved: 0, pending: 0, errors: 0 }
  );

  return NextResponse.json({
    ok: total.errors === 0,
    cities,
    total,
    results,
    durationMs: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(DEFAULT_CITIES);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return run(citiesFrom(body));
}
