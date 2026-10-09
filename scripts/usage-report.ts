// Run locally with database credentials; no public metrics/report read route.
async function main() {
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Days must be an integer from 1 to 90.");
  try { process.loadEnvFile(".env"); } catch { /* Shell environment is also supported. */ }
  const { db } = await import("../lib/db");
  try {
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));
    const rows = await db.dailyMetric.findMany({ where: { day: { gte: since } }, orderBy: [{ day: "asc" }, { kind: "asc" }] });
    console.table(rows.map(row => ({ day: row.day.toISOString().slice(0, 10), kind: row.kind, count: row.count })));
    const totals = Object.fromEntries(["search", "empty_search", "save", "outbound_click"].map(kind => [kind, 0]));
    for (const row of rows) totals[row.kind] = (totals[row.kind] ?? 0) + row.count;
    console.table(totals);
  } finally { await db.$disconnect(); }
}
main().catch(() => {
  console.error("Could not read usage totals. Check database connectivity, the usage migration, and the days argument (1–90).");
  process.exitCode = 1;
});
