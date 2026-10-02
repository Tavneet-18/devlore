// Reproduce the /api/events 500 locally against the real database.
//
// Vercel returns an empty body on 500 in production, so the only way to see the
// actual Postgres error is to run the same query from here. Read-only: nothing
// is written.
import { db } from "../lib/db";
import { getSchemaCapabilities, resetSchemaCapabilities } from "../lib/schema-capabilities";

async function main() {
  console.log("=== 1. raw connectivity ===");
  try {
    const one = await db.$queryRaw<{ n: number }[]>`SELECT 1 AS n`;
    console.log(`  SELECT 1 -> ok (${one[0]?.n})`);
  } catch (e) {
    console.log(`  SELECT 1 -> FAILED: ${(e as Error).message}`);
    return;
  }

  console.log("\n=== 2. what columns does Event actually have? ===");
  const cols = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Event' ORDER BY column_name
  `;
  for (const c of cols) console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);

  console.log("\n=== 3. the four migration-004 columns ===");
  const have = new Set(cols.map((c) => c.column_name));
  for (const c of ["details", "brief", "whoCanJoin", "briefedAt"]) {
    console.log(`  ${c.padEnd(14)} ${have.has(c) ? "present" : "*** MISSING ***"}`);
  }
  console.log("\n=== 3b. the migration-001/003 columns ===");
  for (const c of ["sourceId", "deadlineKind"]) {
    console.log(`  ${c.padEnd(14)} ${have.has(c) ? "present" : "*** MISSING ***"}`);
  }

  console.log("\n=== 4. row count ===");
  try {
    const rows = await db.event.count();
    console.log(`  db.event.count() -> ${rows}`);
  } catch (e) {
    console.log(`  db.event.count() -> FAILED: ${(e as Error).message.split("\n")[0]}`);
  }

  console.log("\n=== 5. a bare findMany (what the OLD deployed code does) ===");
  try {
    const events = await db.event.findMany({ take: 1 });
    console.log(`  ok, ${events.length} row(s)`);
  } catch (e) {
    console.log(`  FAILED: ${(e as Error).message.split("\n").slice(0, 6).join("\n          ")}`);
  }

  console.log("\n=== 6. schema capabilities probe ===");
  resetSchemaCapabilities();
  const caps = await getSchemaCapabilities();
  console.log(`  ${JSON.stringify(caps)}`);

  console.log("\n=== 7. the EXACT select the new /api/events uses ===");
  const { eventSelect } = await import("../lib/events");
  const select = await eventSelect();
  console.log(`  keys: ${Object.keys(select).join(", ")}`);
  try {
    const rows = await db.event.findMany({ select, take: 1 });
    console.log(`  ok, ${rows.length} row(s)`);
  } catch (e) {
    console.log(`  FAILED: ${(e as Error).message.split("\n").slice(0, 6).join("\n          ")}`);
  }

  console.log("\n=== 8. narrow it: which column breaks it? ===");
  for (const col of ["brief", "whoCanJoin", "details", "briefedAt", "sourceId", "deadlineKind"]) {
    try {
      await db.event.findMany({ select: { id: true, [col]: true } as never, take: 1 });
      console.log(`  ${col.padEnd(14)} ok`);
    } catch (e) {
      console.log(`  ${col.padEnd(14)} FAILED: ${(e as Error).message.split("\n")[0].slice(0, 110)}`);
    }
  }

  await db.$disconnect();
}

void main();
