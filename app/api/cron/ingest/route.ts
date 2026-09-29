import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ingestAll } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

/**
 * Vercel Cron calls GET /api/cron/ingest with `Authorization: Bearer
 * <CRON_SECRET>` automatically, but only when a CRON_SECRET environment
 * variable exists on the project. So requiring that header is both safe and
 * functional.
 *
 * Two escape hatches used to exist here and both have been removed:
 *   - `?secret=<value>` in the query string, which leaked the secret into
 *     access logs, browser history and referrer headers;
 *   - "allow unauthenticated when VERCEL=1", which made the endpoint an open
 *     write API for anyone who could reach the deployment.
 *
 * If CRON_SECRET is unset the endpoint is closed, not open.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = match[1].trim();
  if (!provided) return false;

  // Hash first so the compared buffers are always the same length; returning
  // early on a length mismatch would itself leak the secret's length.
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
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
