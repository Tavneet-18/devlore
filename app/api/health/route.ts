import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-session";
import { isAuthBypassed } from "@/lib/auth-bypass";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Public callers get `{ ok: boolean }` and nothing else. The detailed report
 * used to be served to anyone, which leaked the database host, the port, the
 * pooler layout, the configured providers, whether a cron secret existed, and
 * the shape of the database password. None of that belongs on an unauthenticated
 * endpoint.
 *
 * The full report is now available to:
 *   - a valid admin session cookie, or
 *   - `x-health-key: <HEALTH_KEY>`
 */

/** Constant-time compare, so the key cannot be discovered byte by byte. */
function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function isAuthorised(request: NextRequest): Promise<boolean> {
  if (isAuthBypassed()) return true;

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifyAdminToken(token)) return true;

  const expected = process.env.HEALTH_KEY;
  if (expected) {
    const provided = request.headers.get("x-health-key");
    if (provided && keyMatches(provided, expected)) return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    await db.$queryRaw`SELECT 1 AS ok`;
  } catch {
    // Even the failure case is only a boolean on the public route.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  if (!(await isAuthorised(request))) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const report = await detailedReport();
  if (isAuthBypassed()) report.authBypassed = true;
  return NextResponse.json(report, { status: 200 });
}

/**
 * Authenticated diagnostics.
 *
 * Hostnames and ports only, never credentials. The password *shape* reporting
 * that used to live here is deliberately gone: character class and length of a
 * secret is itself a disclosure, and the encoding question it answered has
 * long since been settled.
 */
async function detailedReport() {
  const out: Record<string, unknown> = {};

  const redact = (u?: string) => {
    if (!u) return "(unset)";
    try {
      const parsed = new URL(u);
      return `${parsed.hostname}:${parsed.port || "default"}/${parsed.pathname.replace(/^\//, "")}`;
    } catch {
      return "(unparseable)";
    }
  };

  out.ok = true;
  out.databaseUrl = redact(process.env.DATABASE_URL);
  out.directUrl = redact(process.env.DIRECT_URL);
  out.discoveryMode = process.env.DISCOVERY_MODE ?? "(unset)";
  out.aiProvider = process.env.AI_PROVIDER ?? "(unset)";
  out.hasCronSecret = Boolean(process.env.CRON_SECRET);
  out.adminConfigured = Boolean(process.env.ADMIN_PASSWORD);
  out.healthKeyConfigured = Boolean(process.env.HEALTH_KEY);
  out.rateLimitDistributed = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  try {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Event','Bookmark','View','EventSourceRef','IngestRun')
    `;
    const found = Number(rows[0]?.count ?? 0);
    out.tablesFound = found;
    out.tablesExpected = 5;
  } catch (e) {
    out.tableCheck = `FAILED: ${String((e as Error).message).slice(0, 200)}`;
  }

  // A missing column makes every event query fail at runtime while connectivity
  // still looks healthy, so it is worth naming explicitly.
  //
  // This list must cover every column the code selects, not just the ones the
  // first migration created. It previously omitted sourceId, deadlineKind,
  // brief, whoCanJoin and details, so it reported "schema up to date" on a
  // database missing exactly those — a false green that hid a total outage of
  // the events API. Anything in eventSelect() belongs here.
  try {
    const cols = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Event'
    `;
    const present = new Set(cols.map((c) => c.column_name));
    // Grouped by the migration that introduces them, so a failure names the
    // file to run instead of just a column.
    const byMigration: Record<string, string[]> = {
      "001_source_identity.sql": ["sourceId", "deadlineKind"],
      "004_event_details.sql": ["details", "brief", "whoCanJoin", "briefedAt"],
    };
    // Always required — from the original schema.
    const base = [
      "id", "title", "summary", "description", "date", "endDate", "city", "country",
      "isOnline", "eventType", "organizer", "link", "imageUrl", "tags",
      "beginnerFriendly", "source", "status", "viewCount", "createdAt",
      "updatedAt", "externalId", "hash", "fetchedAt", "rawPayload", "expiresAt",
    ];
    const missing = base.filter((c) => !present.has(c));
    const pending: string[] = [];
    for (const [file, group] of Object.entries(byMigration)) {
      const absent = group.filter((c) => !present.has(c));
      if (absent.length === group.length) pending.push(file);
      else missing.push(...absent);
    }
    out.eventColumnsMissing = missing;
    // Only "up to date" when every optional migration has landed too. A
    // database on the base schema is not out of date, but it is not complete
    // either, and the difference decides what the site can show.
    out.pendingMigrations = pending;
    out.schemaUpToDate = missing.length === 0 && pending.length === 0;
  } catch (e) {
    out.columnCheck = `FAILED: ${String((e as Error).message).slice(0, 200)}`;
  }

  return out;
}
