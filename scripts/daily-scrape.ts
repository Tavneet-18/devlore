#!/usr/bin/env tsx
/**
 * Daily scrape runner — Playwright MCP + Groq (or mock).
 * Usage:
 *   npx tsx scripts/daily-scrape.ts                 # all cities, live ingest
 *   npx tsx scripts/daily-scrape.ts --city=Bangalore
 *   npx tsx scripts/daily-scrape.ts --dry-run       # no DB write, just log
 *
 * Can be run locally or via GitHub Actions (see .github/workflows/scrape.yml).
 * Alternatively, trigger the hosted cron: curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/ingest
 */

import { ingestAll, ingestCity } from "../lib/ingest";

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const cityArg = args.find((a) => a.startsWith("--city="))?.split("=")[1];

  if (dryRun) {
    console.log("DRY RUN — no DB write, discovery only");
    // In dry-run we just call discoverEvents directly
    const { discoverEvents } = await import("../lib/ai/discovery");
    const cities = cityArg ? [cityArg] : CITIES;
    for (const city of cities) {
      const res = await discoverEvents(city);
      console.log(`[${city}] found=${res.found} deduped=${res.deduped} sample=`, res.events.slice(0, 2).map((e) => e.title));
    }
    return;
  }

  if (cityArg) {
    console.log(`Ingesting single city: ${cityArg}`);
    const res = await ingestCity(cityArg);
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`Ingesting all cities: ${CITIES.join(", ")}`);
    const results = await ingestAll(CITIES);
    console.log(JSON.stringify(results, null, 2));
    const total = results.reduce((acc, r) => ({ upserted: acc.upserted + r.upserted, approved: acc.approved + r.approved, pending: acc.pending + r.pending, errors: acc.errors + r.errors }), { upserted: 0, approved: 0, pending: 0, errors: 0 });
    console.log(`TOTAL upserted=${total.upserted} approved=${total.approved} pending=${total.pending} errors=${total.errors}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
