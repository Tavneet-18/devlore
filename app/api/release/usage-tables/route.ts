import { NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Temporary release-only endpoint. The random token is kept off-repository;
// only its SHA-256 hash is deployed. Remove this route after the migration.
const TOKEN_HASH = "80058a2dd38d4fdb3d24168511090603320015b47a82ab212dd2b5d7ef34db69";
const MIGRATION = "20261010000000_usage_and_reports";
const CHECKSUM = "e30892e09a7c5af133e6dd40ce021f9b08561aefbb517ffbc1795c40696aa293";

function authorized(request: Request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return false;
  return timingSafeEqual(createHash("sha256").update(match[1]).digest(), Buffer.from(TOKEN_HASH, "hex"));
}

async function status() {
  const tables = await db.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('DailyMetric', 'EventReport', '_prisma_migrations')
  `;
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name IN ('DailyMetric', 'EventReport')
  `;
  const expected = { DailyMetric: ["day", "kind", "count"], EventReport: ["id", "eventId", "reason", "comment", "status", "createdAt"] };
  const missing = Object.entries(expected).flatMap(([table, names]) => names.filter(name => !columns.some(c => c.table_name === table && c.column_name === name)).map(name => `${table}.${name}`));
  const history = tables.some(t => t.tablename === "_prisma_migrations")
    ? await db.$queryRaw<{ migration_name: string; complete: boolean; rolled_back: boolean }[]>`
      SELECT migration_name, finished_at IS NOT NULL AS complete, rolled_back_at IS NOT NULL AS rolled_back
      FROM "_prisma_migrations" ORDER BY started_at
    ` : [];
  return { ready: missing.length === 0 && tables.filter(t => ["DailyMetric", "EventReport"].includes(t.tablename) && t.rowsecurity).length === 2, tables, missing, history };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await status(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Database check unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await db.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(427601010)::text");
      // Only this fixed additive migration. No SQL or options accepted from callers.
      await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "DailyMetric" ("day" DATE NOT NULL, "kind" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("day", "kind"))');
      await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "EventReport" ("id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "reason" TEXT NOT NULL, "comment" TEXT, "status" TEXT NOT NULL DEFAULT \'OPEN\', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id"), CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE)');
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EventReport_status_createdAt_idx" ON "EventReport"("status", "createdAt")');
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EventReport_eventId_idx" ON "EventReport"("eventId")');
      await tx.$executeRawUnsafe('ALTER TABLE "DailyMetric" ENABLE ROW LEVEL SECURITY');
      await tx.$executeRawUnsafe('ALTER TABLE "EventReport" ENABLE ROW LEVEL SECURITY');
      const metadata = await tx.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') AS exists`;
      if (metadata[0]?.exists) {
        const recorded = await tx.$queryRaw<{ checksum: string; complete: boolean }[]>`SELECT checksum, finished_at IS NOT NULL AS complete FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION} AND rolled_back_at IS NULL`;
        if (recorded.length && recorded.some(row => row.checksum !== CHECKSUM || !row.complete)) throw new Error("Migration history mismatch");
        if (!recorded.length) await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (${randomUUID()}, ${CHECKSUM}, NOW(), ${MIGRATION}, NOW(), 1)`;
      }
    }, { timeout: 30000 });
    const result = await status();
    return NextResponse.json({ applied: result.ready, ...result }, { status: result.ready ? 200 : 503 });
  } catch { return NextResponse.json({ error: "Migration not completed" }, { status: 503 }); }
}
