import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSchemaCapabilities } from "@/lib/schema-capabilities";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ingest-runs
 *
 * The last 10 runs per source, for the source-health page.
 *
 * This exists because a silent ingest is indistinguishable from a working one.
 * Before this, a platform that changed its markup simply stopped contributing
 * and nothing said so: the cron reported only what it wrote, never what it
 * failed to fetch.
 */
export async function GET() {
  const caps = await getSchemaCapabilities();

  if (!caps.ingestRun) {
    return NextResponse.json({
      available: false,
      message:
        "The IngestRun table does not exist yet. Run prisma/migrations/002_ingest_run.sql in the Supabase SQL editor.",
      sources: [],
    });
  }

  try {
    // Take the most recent run per source without loading the whole table.
    const runs = await db.ingestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 400,
    });

    const bySource = new Map<string, typeof runs>();
    for (const run of runs) {
      const list = bySource.get(run.source) ?? [];
      if (list.length < 10) list.push(run);
      bySource.set(run.source, list);
    }

    return NextResponse.json({
      available: true,
      generatedAt: new Date().toISOString(),
      sources: [...bySource.entries()].map(([source, list]) => {
        const latest = list[0];
        return {
          source,
          runs: list,
          latest,
          // A source that errored on every recent run is unhealthy even though
          // "it ran" is technically true.
          status: latest.errors > 0 && latest.fetched === 0 ? "failing" : latest.fetched === 0 && latest.errors === 0 ? "empty" : "ok",
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { available: false, message: String((e as Error).message).slice(0, 300), sources: [] },
      { status: 500 }
    );
  }
}
